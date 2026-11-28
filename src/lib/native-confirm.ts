import { requestNativeConfirmation } from './native-app';

export async function confirmNativeAction(
  options: Parameters<typeof requestNativeConfirmation>[0],
): Promise<boolean> {
  const confirmed = await requestNativeConfirmation(options);
  if (confirmed !== null) return confirmed;
  return typeof window !== 'undefined' && window.confirm(options.message);
}
