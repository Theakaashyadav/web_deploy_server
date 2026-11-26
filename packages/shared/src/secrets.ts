import crypto from 'node:crypto';
import { db } from '../../database/src/index.js';

function encryptionKey() {
  const encoded=process.env.ENCRYPTION_KEY || '';
  if(!/^[a-f0-9]{64}$/i.test(encoded))throw new Error('ENCRYPTION_KEY must contain 64 hexadecimal characters before storing or using deployment secrets');
  return Buffer.from(encoded,'hex');
}
export function encryptSecret(value:string) {
  const nonce=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey(),nonce);
  const ciphertext=Buffer.concat([cipher.update(value,'utf8'),cipher.final()]);
  return [nonce,cipher.getAuthTag(),ciphertext].map(part=>part.toString('base64url')).join('.');
}
export function decryptSecret(value:string) {
  const parts=value.split('.');if(parts.length!==3)throw new Error('Invalid encrypted deployment secret');
  const [nonce,tag,ciphertext]=parts.map(part=>Buffer.from(part,'base64url'));
  const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey(),nonce);decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8');
}
export async function projectSecrets(projectId:string,environment:string) {
  const entries=await db.environmentVariable.findMany({where:{projectId,environment}});
  return Object.fromEntries(entries.map(entry=>[entry.name,decryptSecret(entry.ciphertext)]));
}
