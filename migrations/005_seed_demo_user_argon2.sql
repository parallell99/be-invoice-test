-- 005: user ตัวอย่าง 1 บัญชี (Argon2id) — รหัส: secret12
-- upsert: ถ้ามี user_name อยู่แล้วจะอัปเดตแฮชเป็น Argon2

INSERT INTO users (user_name, password_hash)
VALUES (
  'demo_user',
  '$argon2id$v=19$m=65536,t=3,p=4$MoH/Uve3p8oEi7GLGCY2bQ$D19tENTB2NGUoi7oQvymj3BPuAHkjmATlJsx67UqZbE'
)
ON CONFLICT (user_name) DO UPDATE
SET password_hash = EXCLUDED.password_hash;
