import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { db } from '../../packages/database/src/index.js';

const [email, confirmation] = process.argv.slice(2);
if (!email || confirmation !== '--confirm-reset') {
  console.error('Usage: node --import tsx infrastructure/scripts/reset-password.ts EMAIL --confirm-reset');
  console.error('Requires server database access. Replaces the password and revokes all sessions and API keys for this account.');
  process.exit(1);
}
try {
  const user = await db.user.findUnique({where:{email:email.toLowerCase()}});
  if(!user) throw new Error('Account not found');
  const password=randomBytes(24).toString('base64url');
  const passwordHash=await bcrypt.hash(password,12);
  await db.$transaction([
    db.user.update({where:{id:user.id},data:{passwordHash}}),
    db.session.deleteMany({where:{userId:user.id}}),
    db.apiKey.deleteMany({where:{userId:user.id}}),
    db.activityLog.create({data:{userId:user.id,action:'auth.operator-password-reset'}}),
  ]);
  console.log(`Temporary replacement password (shown once): ${password}`);
  console.log('Store this credential securely. All prior sessions and API keys have been revoked.');
} catch(error) {console.error((error as Error).message);process.exitCode=1;}
finally {await db.$disconnect();}
