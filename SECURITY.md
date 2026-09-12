# Security

หากพบช่องโหว่ที่เกี่ยวกับ token, pairing, Desktop Control หรือ remote access กรุณาอย่าโพสต์ข้อมูลลับลงใน public issue

ข้อมูลที่ไม่ควรแนบใน issue:
- access token / refresh token
- pairing code ที่ยังใช้งานได้
- `%APPDATA%\NovaMCP\config.json`
- audit log ที่มีข้อมูลส่วนตัว
- screenshot ที่มีข้อมูลบัญชีหรือ credential

NovaMCP ตั้งค่า Desktop Control เป็นปิดโดยค่าเริ่มต้นสำหรับผู้ใช้ใหม่ และสามารถเปิด/ปิดได้จาก Dashboard

Binary release ควรดาวน์โหลดจาก GitHub Releases ของ repository นี้เท่านั้น และสามารถตรวจ SHA-256 ด้วย `SHA256SUMS.txt`
