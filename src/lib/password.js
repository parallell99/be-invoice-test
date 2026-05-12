import argon2 from 'argon2'
import bcrypt from 'bcrypt'

/** แฮชรหัสผ่านใหม่ด้วย Argon2id */
export async function hashPassword (plain) {
  return argon2.hash(plain, { type: argon2.argon2id })
}

/**
 * ตรวจรหัสกับค่าในฐานข้อมูล
 * รองรับ Argon2 (ใหม่) และ bcrypt (ข้อมูลเก่า) — ถ้า bcrypt ผ่านให้อัปเกรดเป็น Argon2 ตอนล็อกอิน
 */
export async function verifyStoredPassword (hash, plain) {
  if (!hash || typeof hash !== 'string') {
    return { valid: false, needsUpgrade: false }
  }
  if (hash.startsWith('$argon2')) {
    try {
      return { valid: await argon2.verify(hash, plain), needsUpgrade: false }
    } catch {
      return { valid: false, needsUpgrade: false }
    }
  }
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$') || hash.startsWith('$2y$')) {
    const valid = await bcrypt.compare(plain, hash)
    return { valid, needsUpgrade: !!valid }
  }
  return { valid: false, needsUpgrade: false }
}
