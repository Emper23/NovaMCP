# Source availability

NovaMCP เปิด source เฉพาะบางส่วนของ desktop application เพื่อให้ตรวจสอบโครงสร้าง UI, local runtime, config และ Desktop Control ได้

ส่วนที่เปิดใน repository นี้ไม่ใช่ source code ของ production system ทั้งหมด และไม่สามารถใช้สร้าง service ฝั่ง Cloud ได้ครบด้วยตัวมันเอง

ไม่ได้เผยแพร่:
- Cloud relay production backend
- Cloudflare Worker production source
- deployment configuration
- private infrastructure
- credentials, tokens หรือ operational secrets

การเผยแพร่ source ใน repository นี้ไม่ได้หมายความว่าอนุญาตให้นำชื่อ NovaMCP, binary release หรือ service backend ไปเผยแพร่ซ้ำภายใต้ชื่ออื่นโดยอัตโนมัติ

ถ้าต้องการให้ repository นี้เป็น open-source ภายใต้ MIT/Apache-2.0 ในอนาคต ควรเพิ่ม license ที่ชัดเจนก่อน
