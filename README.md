# NovaMCP

NovaMCP เป็นตัวเชื่อม ChatGPT กับ Roblox Studio ผ่าน MCP เพื่อให้ ChatGPT เรียก tools สำหรับช่วยสร้าง แก้ และตรวจงานในเกมได้จากแชต

## ดาวน์โหลด

ดาวน์โหลดเวอร์ชันล่าสุดจาก GitHub Releases

ไฟล์แนะนำสำหรับผู้ใช้ทั่วไป:

`NovaMCP-Setup-7.0.3-x64.exe`

ถ้าต้องการแบบไม่ติดตั้ง:

`NovaMCP-Portable-7.0.3-x64.exe`

รองรับ Windows 64-bit

> ตอนนี้ไฟล์ยังไม่ได้ลง Authenticode certificate ดังนั้น Windows SmartScreen อาจแสดงคำเตือนก่อนเปิด

## ฟีเจอร์หลัก

- เชื่อม ChatGPT กับ Roblox Studio
- Dashboard สำหรับดูสถานะการเชื่อมต่อ
- Pairing code สำหรับเชื่อม Connector
- Desktop Control ที่เปิด/ปิดได้จาก Dashboard
- Audit log และ diagnostics
- Config แยกต่อผู้ใช้ใน `%APPDATA%\NovaMCP`
- ระบบอัปเดตจาก GitHub Releases
  - รุ่น Setup เช็ก ดาวน์โหลด และกด `Restart & Install` ได้จาก Dashboard
  - รุ่น Portable แจ้งเมื่อมีเวอร์ชันใหม่และเปิดลิงก์ดาวน์โหลดให้

## Source ที่เปิดใน repository นี้

repository นี้เป็น **partial source / source-available** ไม่ใช่ source ของระบบทั้งหมด

ส่วนที่เปิดให้ดู:
- Dashboard UI และ local control plane
- Electron desktop shell
- Update manager
- Config/runtime state
- Audit log
- Desktop Control module

ส่วนที่ไม่ได้เปิด:
- Cloud relay backend และ production Worker
- deployment configuration
- private infrastructure และ operational tooling

## Verify download

ไฟล์ `SHA256SUMS.txt` ใน Release ใช้ตรวจ SHA-256 ของไฟล์ดาวน์โหลดได้

## Version

Current release: `7.0.3`

ดูรายละเอียดใน `RELEASE_NOTES.md`
