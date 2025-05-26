/**
 * Encodes a type and local ID into a global ID
 * @param type - The type of the entity (e.g., "Person", "Story")
 * @param localID - The local ID of the entity
 * @returns Base64 encoded global ID
 */
export function encodeGlobalID(type: string, localID: string) {
  return Buffer.from(JSON.stringify([type, localID])).toString('base64');
}

/**
 * Decodes a global ID into its type and local ID components
 * @param globalID - The base64 encoded global ID
 * @returns Object containing type and local ID
 */
export function decodeGlobalID(globalID: string) {
  const decoded = Buffer.from(globalID, 'base64').toString('utf-8');
  const [type, localID] = JSON.parse(decoded) as [string, string];
  return { type, localID };
}
