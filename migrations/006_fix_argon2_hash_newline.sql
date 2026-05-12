-- 006: แก้แฮช Argon2 ที่เคยถูกเก็บพร้อม newline นำหน้า (จาก $argon$ หลายบรรทัดใน migration เก่า)
UPDATE users
SET password_hash = '$argon2id$v=19$m=65536,t=3,p=4$MoH/Uve3p8oEi7GLGCY2bQ$D19tENTB2NGUoi7oQvymj3BPuAHkjmATlJsx67UqZbE'
WHERE user_name = 'demo_user';
