# NovaMCP 7.0.1

## Release

ไฟล์แนะนำสำหรับผู้ใช้ทั่วไป:

`NovaMCP-Setup-7.0.1-x64.exe`

## มีอะไรในเวอร์ชันนี้

- เชื่อม ChatGPT กับ Roblox Studio ผ่าน MCP
- Dashboard สำหรับดูสถานะ ChatGPT, Cloud Relay, Roblox Studio และ Desktop Control
- Pairing code และปุ่มสร้างรหัสใหม่
- Desktop Control เปิด/ปิดได้จาก Dashboard
- Audit log และ diagnostics
- Config แยกต่อผู้ใช้ใน `%APPDATA%\NovaMCP`
- แก้ปัญหา Dashboard port `8181` ชนกับโปรแกรมอื่น
  - ถ้าเป็น NovaMCP ที่เปิดอยู่แล้ว จะใช้ Dashboard เดิม
  - ถ้าเป็นโปรแกรมอื่น จะเลือก port ว่างถัดไปอัตโนมัติ

## หมายเหตุ

- Windows 64-bit เท่านั้น
- ไฟล์ยังไม่ได้เซ็น Authenticode จึงอาจมี Windows SmartScreen เตือน
- Source ใน repository เป็น partial source ไม่ใช่ production backend ทั้งหมด
