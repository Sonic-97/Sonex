import { Injectable, Logger } from '@nestjs/common';
import { MetricsService } from '../observability/metrics/metrics.service';
import * as promClient from 'prom-client';

export interface CustomerRoutingInfo {
  phoneJid: string | null;
  lidJid: string | null;
  lastKnownJid: string | null;
}

export interface RoutingResult {
  destination: string | null;
  strategy: 'phoneJid' | 'lastKnownJid' | 'lidJid_unsafe' | 'none';
  reason?: string;
}

@Injectable()
export class ReplyRouterService {
  private readonly logger = new Logger(ReplyRouterService.name);

  readonly lidMessagesTotal: promClient.Counter<string>;
  readonly phoneResolutionsTotal: promClient.Counter<string>;
  readonly phoneResolutionFailuresTotal: promClient.Counter<string>;
  readonly unresolvedDestinationsTotal: promClient.Counter<string>;
  readonly lidSendAttemptsTotal: promClient.Counter<string>;

  readonly sonicLidResolutionsTotal: promClient.Counter<string>;
  readonly sonicLidResolutionFailuresTotal: promClient.Counter<string>;
  readonly sonicLidMappingRepairsTotal: promClient.Counter<string>;
  readonly sonicLidOutboundAttemptsTotal: promClient.Counter<string>;
  readonly sonicLidCorruptedCustomersTotal: promClient.Counter<string>;
  readonly sonicLidRepairsTotal: promClient.Counter<string>;
  readonly sonicLidUnresolvedTotal: promClient.Counter<string>;

  constructor(private readonly metricsService: MetricsService) {
    const reg = this.metricsService.registry;

    this.lidMessagesTotal = new promClient.Counter({
      name: 'sonic_whatsapp_lid_messages_total',
      help: 'Total incoming messages from @lid JIDs',
      labelNames: ['cafe_id'],
      registers: [reg],
    });

    this.phoneResolutionsTotal = new promClient.Counter({
      name: 'sonic_whatsapp_phone_resolutions_total',
      help: 'Successful LID-to-phone resolutions',
      labelNames: ['cafe_id'],
      registers: [reg],
    });

    this.phoneResolutionFailuresTotal = new promClient.Counter({
      name: 'sonic_whatsapp_phone_resolution_failures_total',
      help: 'Failed LID-to-phone resolution attempts',
      labelNames: ['cafe_id'],
      registers: [reg],
    });

    this.unresolvedDestinationsTotal = new promClient.Counter({
      name: 'sonic_whatsapp_unresolved_destinations_total',
      help: 'Replies blocked due to unresolved destination',
      labelNames: ['cafe_id', 'reason'],
      registers: [reg],
    });

    this.lidSendAttemptsTotal = new promClient.Counter({
      name: 'sonic_whatsapp_lid_send_attempts_total',
      help: 'Outbound send attempts to @lid JIDs (may not deliver)',
      labelNames: ['cafe_id'],
      registers: [reg],
    });

    this.sonicLidResolutionsTotal = new promClient.Counter({
      name: 'sonic_lid_resolutions_total',
      help: 'Total successful LID resolutions',
      labelNames: ['cafe_id'],
      registers: [reg],
    });

    this.sonicLidResolutionFailuresTotal = new promClient.Counter({
      name: 'sonic_lid_resolution_failures_total',
      help: 'Total failed LID resolution attempts',
      labelNames: ['cafe_id'],
      registers: [reg],
    });

    this.sonicLidMappingRepairsTotal = new promClient.Counter({
      name: 'sonic_lid_mapping_repairs_total',
      help: 'Total LID mapping repairs performed by background job',
      labelNames: ['cafe_id'],
      registers: [reg],
    });

    this.sonicLidOutboundAttemptsTotal = new promClient.Counter({
      name: 'sonic_lid_outbound_attempts_total',
      help: 'Total outbound send attempts to LID targets',
      labelNames: ['cafe_id'],
      registers: [reg],
    });

    this.sonicLidCorruptedCustomersTotal = new promClient.Counter({
      name: 'sonic_lid_corrupted_customers_total',
      help: 'Total corrupted customer records detected (phoneJid fabricated from LID userpart)',
      labelNames: ['cafe_id'],
      registers: [reg],
    });

    this.sonicLidRepairsTotal = new promClient.Counter({
      name: 'sonic_lid_repairs_total',
      help: 'Total corrupted customer records repaired',
      labelNames: ['cafe_id'],
      registers: [reg],
    });

    this.sonicLidUnresolvedTotal = new promClient.Counter({
      name: 'sonic_lid_unresolved_total',
      help: 'Total LID customers with no phone resolution (PendingReply created)',
      labelNames: ['cafe_id'],
      registers: [reg],
    });
  }

  private isFabricatedPhoneJid(phoneJid: string, lidJid: string | null): boolean {
    if (!lidJid) return false;
    const lidUserpart = lidJid.split('@')[0];
    const phoneUserpart = phoneJid.split('@')[0];
    // RULE 4: If phoneJid userpart matches LID userpart, it's fabricated — never send
    return phoneUserpart === lidUserpart;
  }

  getReplyDestination(customer: CustomerRoutingInfo, cafeId?: string): RoutingResult {
    const logMeta = {
      incoming_jid: customer.lidJid || customer.lastKnownJid || '',
      resolved_phone: customer.phoneJid || '',
      destination_jid: '',
      routing_strategy: '',
      correlation_id: '',
      cafe_id: cafeId || '',
    };

    // RULE 4: NEVER fabricate lidUserpart@c.us — check if phoneJid was fabricated from LID
    const hasValidPhoneJid = customer.phoneJid
      && (customer.phoneJid.endsWith('@c.us') || customer.phoneJid.endsWith('@s.whatsapp.net'))
      && !this.isFabricatedPhoneJid(customer.phoneJid, customer.lidJid);

    if (hasValidPhoneJid) {
      const jid = customer.phoneJid!.replace('@s.whatsapp.net', '@c.us');
      logMeta.routing_strategy = 'phoneJid';
      logMeta.destination_jid = jid;
      console.log(JSON.stringify({ event: 'TRACE_ROUTING_DESTINATION', ...logMeta, strategy: 'phoneJid' }));
      return { destination: jid, strategy: 'phoneJid' };
    }

    if (customer.phoneJid && customer.lidJid && this.isFabricatedPhoneJid(customer.phoneJid, customer.lidJid)) {
      console.log(JSON.stringify({ event: 'TRACE_CORRUPTED_CUSTOMER_DETECTED', ...logMeta }));
      this.sonicLidCorruptedCustomersTotal.inc({ cafe_id: cafeId || 'unknown' });
    }

    if (customer.lastKnownJid && customer.lastKnownJid.endsWith('@c.us')) {
      logMeta.routing_strategy = 'lastKnownJid';
      logMeta.destination_jid = customer.lastKnownJid;
      console.log(JSON.stringify({ event: 'TRACE_ROUTING_DESTINATION', ...logMeta, strategy: 'lastKnownJid' }));
      return { destination: customer.lastKnownJid, strategy: 'lastKnownJid' };
    }

    // RULE 5: No valid destination — create PendingReply, DO NOT SEND
    logMeta.routing_strategy = 'none';
    console.log(JSON.stringify({ event: 'routing_no_destination', ...logMeta }));
    this.unresolvedDestinationsTotal.inc({ cafe_id: cafeId || 'unknown', reason: 'NO_PHONE_JID' });
    this.sonicLidUnresolvedTotal.inc({ cafe_id: cafeId || 'unknown' });
    return { destination: null, strategy: 'none', reason: 'NO_PHONE_JID' };
  }
}
