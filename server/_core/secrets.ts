import { createCipheriv, createDecipheriv, createHash, randomBytes } from "crypto";

const ENCRYPTED_SECRET_PREFIX = "enc:v1";

function getEncryptionKey(): Buffer | null {
  const source = process.env.TOKEN_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!source) return null;
  return createHash("sha256").update(source).digest();
}

export function isEncryptedSecret(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(`${ENCRYPTED_SECRET_PREFIX}:`);
}

export function encryptSecret(value: string | null | undefined): string | null | undefined {
  if (!value || isEncryptedSecret(value)) return value;

  const key = getEncryptionKey();
  if (!key) return value;

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTED_SECRET_PREFIX,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptSecret(value: string | null | undefined): string | null | undefined {
  if (!value || !isEncryptedSecret(value)) return value;

  const key = getEncryptionKey();
  if (!key) return value;

  const [, , ivBase64, authTagBase64, encryptedBase64] = value.split(":");
  if (!ivBase64 || !authTagBase64 || !encryptedBase64) return value;

  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivBase64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));

  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(encryptedBase64, "base64")),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}