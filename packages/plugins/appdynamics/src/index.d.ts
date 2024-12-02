declare module 'appdynamics' {
  export function startTransaction(correlationInfo?: string): Transaction;

  export interface Transaction {}
}
