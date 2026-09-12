# NovaMCP

NovaMCP เป็นตัวเชื่อม ChatGPT กับ Roblox Studio ผ่าน MCP เพื่อให้ ChatGPT เรียก tools สำหรับช่วยสร้าง แก้ และตรวจงานในเกมได้จากแชต

## ดาวน์โหลด

ดาวน์โหลดเวอร์ชันล่าสุดจาก GitHub Releases แล้วใช้ไฟล์:

`NovaMCP-Setup-7.0.1-x64.exe`

รองรับ Windows 64-bit

> ตอนนี้ไฟล์ยังไม่ได้ลง Authenticode certificate ดังนั้น Windows SmartScreen อาจแสดงคำเตือนก่อนเปิด

## ฟีเจอร์หลัก

- เชื่อม ChatGPT กับ Roblox Studio
- Dashboard สำหรับดูสถานะการเชื่อมต่อ
- Pairing code สำหรับเชื่อม Connector
- Desktop Control ที่เปิด/ปิดได้จาก Dashboard
- Audit log และ diagnostics
- Config แยกต่อผู้ใช้ใน `%APPDATA%\NovaMCP`

## Source ที่เปิดใน repository นี้

repository นี้เป็น **partial source / source-available** ไม่ใช่ source ของระบบทั้งหมด

ส่วนที่เปิดให้ดู:
- Dashboard UI และ local control plane
- Electron desktop shell
- Config/runtime state
- Audit log
- Desktop Control module

ส่วนที่ไม่ได้เปิด:
- Cloud relay backend และ production Worker
- deployment configuration
- private infrastructure และ operational tooling

## Verify download

ไฟล์ `SHA256SUMS.txt` ใน Release ใช้ตรวจ SHA-256 ของตัวติดตั้งได้

## Version

Current release: `7.0.1`

ดูรายละเอียดใน `RELEASE_NOTES.md`
