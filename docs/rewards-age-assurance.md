# Hogar Feliz Rewards — diseño de verificación de edad

Estado: **diseño pendiente de proveedor; funciones de Rewards desactivadas**.

Este documento define el límite de seguridad para habilitar la participación adulta. No es una implementación de verificación ni una aprobación legal del flujo.

## Objetivo

Permitir que una persona adulta pueda solicitar autorización para gestionar recompensas de un hogar, sin tratar una casilla, una fecha de nacimiento autodeclarada o la aprobación de un administrador como prueba de mayoría de edad.

Las recompensas siguen siendo compartidas: cada aprobación válida concede 7 días de Premium al hogar completo. Los menores pueden beneficiarse del Premium compartido, pero no participan en solicitudes, revisiones ni administración de Rewards.

## Lo que NO se debe hacer

- No activar los RPC actuales de Rewards mientras no exista verificación de edad apropiada.
- No aceptar una fecha de nacimiento escrita por el usuario como verificación suficiente.
- No pedir ni guardar fotos de documentos, selfies, vídeos, plantillas faciales ni datos biométricos en Supabase.
- No permitir que un administrador del hogar convierta por sí solo a otra persona en adulta autorizada.
- No confiar en valores enviados desde la aplicación móvil o web para establecer que una persona es adulta.
- No integrar anuncios como requisito para ganar recompensas ni dirigir publicidad personalizada a menores.

## Flujo propuesto

1. La persona inicia voluntariamente el proceso desde Rewards.
2. El servidor crea una sesión de verificación con un proveedor especializado, después de seleccionar y revisar el proveedor y sus condiciones.
3. La persona completa el proceso directamente con ese proveedor. Hogar Feliz no recibe ni almacena los documentos o imágenes usados por el proveedor.
4. El proveedor notifica el resultado al servidor mediante un webhook autenticado y verificable. La aplicación nunca puede enviar por sí misma un resultado de verificación.
5. El servidor valida firma, emisor, audiencia, referencia de sesión, caducidad y estado final. Solo acepta una afirmación mínima y explícita de mayoría de edad (18+), si el proveedor la ofrece de forma fiable.
6. Se guarda únicamente el identificador opaco de la verificación, proveedor, resultado mínimo, fecha y versión de política/consentimiento. No guardar fecha de nacimiento ni materiales de identidad.
7. La persona solicita ser autorizada en su hogar. Un administrador puede revisar la solicitud de pertenencia y el contexto del hogar, pero no puede sustituir la verificación de edad.
8. Solo un adulto ya verificado y autorizado, distinto de quien presentó la solicitud de recompensa, puede revisarla.
9. Cada aprobación válida suma exactamente 7 días al Premium del hogar, de forma atómica y auditable.

## Selección del proveedor: bloqueante

No se ha elegido ni conectado un proveedor. Antes de hacerlo hay que confirmar:

- que el proveedor ofrece un resultado de edad 18+ apropiado para el caso de uso y los países donde operará;
- qué métodos utiliza (por ejemplo, comprobación documental, estimación de edad u otros) y sus límites de precisión;
- qué datos recoge, dónde los procesa, cuánto tiempo los conserva y cómo los elimina;
- si admite usuarios en Colombia y cumple sus requisitos contractuales y de privacidad;
- cómo funciona el consentimiento, la atención de errores, la revisión manual y la apelación;
- el coste, la disponibilidad móvil/web y la seguridad de sus webhooks.

No seleccionar automáticamente verificación facial. Cualquier método que use rostro, documento o biometría requiere una evaluación de privacidad, seguridad, proporcionalidad y requisitos legales antes de implementarse.

## Contrato técnico mínimo

La futura integración debe ser servidor-a-servidor:

- La clave secreta del proveedor vive solo en un entorno backend seguro; nunca en Expo, la web ni el repositorio.
- El inicio de sesión genera un identificador aleatorio de sesión asociado al usuario autenticado.
- El webhook verifica criptográficamente la autenticidad del mensaje y evita la repetición de eventos.
- Un resultado aprobado debe estar ligado al mismo usuario y a una sesión no expirada.
- Un resultado rechazado, incierto, caducado o no verificable no concede permisos.
- La revocación o caducidad de la verificación debe suspender nuevas acciones de Rewards.
- Todas las operaciones de autorización y concesión de días se validan en el servidor y dentro de transacciones.
- La aplicación muestra estados comprensibles, sin revelar detalles sensibles del proceso.

## Criterios para habilitar Rewards

- Proveedor seleccionado y evaluación de privacidad completada.
- Aviso de privacidad y consentimiento revisados para los países de lanzamiento.
- Webhook autenticado, pruebas anti-repetición y manejo de errores completados.
- Pruebas que demuestren que un usuario menor, no verificado, con verificación incierta o con sesión manipulada no puede activar permisos.
- Pruebas que impidan autoaprobación, aprobación por no autorizados, doble concesión y concesión a hogares ajenos.
- Revisión final de políticas de plataforma y requisitos aplicables.

Hasta que todos los criterios se cumplan, la pantalla permanece informativa y los RPC de Rewards continúan sin permiso de ejecución para `authenticated` y `anon`.
