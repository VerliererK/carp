export default (
  input: RequestInfo | URL,
  init?: RequestInit,
  timeout = 60000
) => {
  const controller = new AbortController();
  const { signal } = controller;

  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return fetch(input, { ...init, signal }).finally(() => clearTimeout(timeoutId));
};
