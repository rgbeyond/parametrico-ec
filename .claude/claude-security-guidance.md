# Security guidance — Paramétrico EC
- PROD (`xteroaxzhkixehnnbpbh`) no se modifica sin autorización explícita; DEV no implica PROD.
- Sin sesión válida no se accede al módulo cuando hay backend configurado.
- No usar `user_metadata` como autoridad; RLS/Core mandan.
- Catálogo cloud no debe tener fallback silencioso ante error autenticado.
- No exponer costos si falta `view_costs`.
- No comitear secretos/.env/service-role ni PII.
- Los links/proxy/assets no deben crear un bypass de autenticación ni apuntar por accidente a PROD.