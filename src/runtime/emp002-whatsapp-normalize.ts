/** Normalize WhatsApp phone numbers for tenant-scoped owner identity comparison. */
export function normalizeEMP002WhatsAppNumber(value: string): string {
  return value.replace(/\D/g, '');
}
