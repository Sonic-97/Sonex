import { Injectable } from '@nestjs/common';
import { ReceiptTemplateLine, PrinterType } from './interfaces/receipt-data.interface';

@Injectable()
export class ReceiptRenderer {
  render(template: ReceiptTemplateLine[], printerType: PrinterType): string {
    switch (printerType) {
      case PrinterType.ESCPOS: return this.renderESCPOS(template);
      case PrinterType.WINDOWS: return this.renderPlainText(template);
      case PrinterType.PDF: return this.renderHTML(template);
      case PrinterType.BROWSER: return this.renderHTML(template);
    }
  }

  renderPlainText(template: ReceiptTemplateLine[]): string {
    return template.map(line => {
      switch (line.type) {
        case 'separator': return line.text;
        case 'empty': return '';
        case 'title': {
          if (line.align === 'center') {
            const padding = Math.max(0, Math.floor((32 - line.text.length) / 2));
            return ' '.repeat(padding) + line.text;
          }
          return line.text;
        }
        default: return line.text;
      }
    }).join('\n');
  }

  renderHTML(template: ReceiptTemplateLine[]): string {
    const lines = template.map(line => {
      switch (line.type) {
        case 'separator': return `<div style="font-family: monospace; white-space: pre;">${this.escapeHtml(line.text)}</div>`;
        case 'empty': return '<br/>';
        case 'title': {
          const style = `font-family: monospace; white-space: pre; font-weight: ${line.bold ? 'bold' : 'normal'}; font-size: ${line.double ? '1.5em' : '1em'}; text-align: ${line.align || 'left'};`;
          return `<div style="${style}">${this.escapeHtml(line.text)}</div>`;
        }
        case 'header':
        case 'item':
        case 'total':
          return `<div style="font-family: monospace; white-space: pre;">${this.escapeHtml(line.text)}</div>`;
        case 'text':
        default: {
          const style = `font-family: monospace; white-space: pre; font-weight: ${line.bold ? 'bold' : 'normal'}; text-align: ${line.align || 'left'};`;
          return `<div style="${style}">${this.escapeHtml(line.text)}</div>`;
        }
      }
    }).join('\n');

    return `<!DOCTYPE html><html dir="rtl"><head><meta charset="utf-8"/><title>Receipt</title><style>body{margin:0;padding:16px;font-size:12px}@media print{@page{margin:0}}@media screen{body{max-width:80mm;margin:0 auto;border:1px solid #ccc}}</style></head><body>${lines}</body></html>`;
  }

  private renderESCPOS(template: ReceiptTemplateLine[]): string {
    return template.map(line => {
      switch (line.type) {
        case 'separator': return line.text + '\n';
        case 'empty': return '\n';
        case 'title': {
          if (line.double) {
            return '\x1b\x21\x30' + line.text + '\x1b\x21\x00\n';
          }
          if (line.bold) {
            return '\x1b\x45\x01' + line.text + '\x1b\x45\x00\n';
          }
          return line.text + '\n';
        }
        case 'header':
        case 'item':
        case 'total':
          return line.text + '\n';
        case 'text':
        default:
          return line.text + '\n';
      }
    }).join('');
  }

  private escapeHtml(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
