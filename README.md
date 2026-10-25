# Hogar Feliz — prototipo Expo + Supabase

Primer prototipo Android con diseño moderno, registro/inicio de sesión y acciones para crear una familia o unirse con código usando las funciones RPC existentes del proyecto Supabase.

## Para probar
1. Descomprime el ZIP en un ordenador o entorno compatible con Node.js.
2. Ejecuta `npm install`.
3. Ejecuta `npx expo start`.
4. Abre Expo Go en Android y escanea el QR.

## Notas
- Usa la publishable key, nunca una `service_role`.
- Activa Email en Supabase Authentication.
- Si Supabase exige confirmar el correo, confirma antes de iniciar sesión.
- No es todavía un APK instalable. Falta probar el flujo de extremo a extremo, implementar el panel de tareas/compras y generar el APK firmado.
