import { AiToolDefinition } from './ai-tool.types';

export const AI_TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    name: 'search_menu',
    description: 'Search active drinks and food in the current cafe menu. Use whenever a customer asks what is available, asks for recommendations, or requests a product.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search keyword like latte, coffee, mocha, cold drinks',
        },
        categoryId: {
          type: 'string',
          description: 'Optional category ID to filter by',
        },
      },
    },
  },
  {
    name: 'get_product_details',
    description: 'Get verified pricing, available sizes, and extras for a specific product ID.',
    parameters: {
      type: 'object',
      properties: {
        productId: {
          type: 'string',
          description: 'Exact product ID obtained from search_menu',
        },
      },
      required: ['productId'],
    },
  },
  {
    name: 'get_cafe_operational_status',
    description: 'Check opening hours, whether the cafe is currently open, and general delivery availability.',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'check_delivery_quote',
    description: 'Calculate delivery fee, coverage area, and minimum order amount for a customer address or area.',
    parameters: {
      type: 'object',
      properties: {
        areaName: {
          type: 'string',
          description: 'Name of the street or neighborhood mentioned by customer',
        },
        subtotal: {
          type: 'number',
          description: 'Current order subtotal to verify minimum delivery amount',
        },
      },
      required: ['subtotal'],
    },
  },
  {
    name: 'calculate_order_quote',
    description: 'Calculate the authoritative mathematical price total including base prices, sizes, extras, delivery, and promotions. The AI must NEVER calculate money itself.',
    parameters: {
      type: 'object',
      properties: {
        deliveryArea: {
          type: 'string',
          description: 'Area or street name for delivery fee calculation',
        },
      },
    },
  },
  {
    name: 'create_order_transaction',
    description: 'Finalize and save the customer order into the database once the customer explicitly confirms all details. Uses the quote previously produced by calculate_order_quote; never pass prices or totals yourself.',
    parameters: {
      type: 'object',
      properties: {
        deliveryAddress: {
          type: 'string',
          description: 'Full delivery address if the order is delivery',
        },
        notes: {
          type: 'string',
          description: 'Any customer special instructions (e.g., extra hot, light sugar)',
        },
      },
    },
  },
  {
    name: 'handoff_to_human',
    description: 'Transfer the customer conversation to human staff when there is a complaint, refund inquiry, or when explicitly requested.',
    parameters: {
      type: 'object',
      properties: {
        reason: {
          type: 'string',
          description: 'Reason for handoff (e.g., customer_complaint, human_requested, repeated_misunderstanding)',
        },
      },
      required: ['reason'],
    },
  },
  {
    name: 'get_payment_instructions',
    description: 'Get verified digital payment methods (InstaPay, Vodafone Cash, Smart Wallets) configured by this cafe, with exact transfer details, wallet numbers, and instructions. Call when the customer asks how to pay electronically, asks for InstaPay, Vodafone Cash, or payment details.',
    parameters: {
      type: 'object',
      properties: {
        orderCode: {
          type: 'string',
          description: 'Optional order code if customer already placed an order',
        },
      },
    },
  },
  {
    name: 'submit_payment_reference',
    description: 'Submit customer digital transfer reference number or wallet transaction ID for verification by the cafe. Call when the customer says they sent money, paid via InstaPay/Vodafone Cash, or provides a transaction/reference number.',
    parameters: {
      type: 'object',
      properties: {
        referenceNumber: {
          type: 'string',
          description: 'The transaction reference number, transfer ID, or sender wallet number provided by customer',
        },
        provider: {
          type: 'string',
          description: 'Payment method used: INSTAPAY, VODAFONE_CASH, ORANGE_MONEY, ETISALAT_CASH, WE_PAY, or OTHER',
        },
        amount: {
          type: 'number',
          description: 'Amount transferred if mentioned by the customer',
        },
        orderCode: {
          type: 'string',
          description: 'Order code if known or mentioned',
        },
      },
      required: ['referenceNumber'],
    },
  },
  {
    name: 'check_playstation_availability',
    description: 'Check available PlayStation gaming devices, VIP rooms, and hourly rates in the cafe. Use whenever a customer asks if there are free PlayStation devices, asks for gaming rates/prices, or inquires about booking/playing PS4/PS5/VIP rooms.',
    parameters: {
      type: 'object',
      properties: {
        deviceType: {
          type: 'string',
          description: 'Optional filter: PS5, PS4, VIP_ROOM, or ALL',
        },
      },
    },
  },
  {
    name: 'check_inventory_and_costing',
    description: 'Check stock levels of coffee beans, milk, takeaway cups, lids, and packaging materials. Also calculate live recipe cost and profit margins for drinks in Dine-In (ceramic cup, 0 packaging) vs Takeaway (paper cup + lid + sleeve). Use when the owner asks about inventory balances, low stock, or drink cost/profit.',
    parameters: {
      type: 'object',
      properties: {
        productName: {
          type: 'string',
          description: 'Optional product name to inspect recipe BOM and cup cost (e.g. فلات وايت, لاتيه, كابتشينو)',
        },
        category: {
          type: 'string',
          description: 'Optional category filter: INGREDIENTS, PACKAGING, LOW_STOCK, or ALL',
        },
      },
    },
  },
];


