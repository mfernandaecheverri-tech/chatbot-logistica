const { run, get } = require('./db');
const { crearEvento, consultarEventos, agregarPreguntaEvento } = require('./events');
const { registrarPersona } = require('./people');
const { registrarSolicitud, guardarRespuesta, cambiarEstadoSolicitud, retirarSolicitud } = require('./applications');
const { consultarReporteEvento, verificarConsistenciaEvento, exportarEventoCSV } = require('./reports');

async function ejecutarPruebas() {
    try {
        console.log('INICIANDO PRUEBAS DE BASE DE DATOS Y REPORTES');

        // 1. Asegurar que exista al menos un administrador para crear eventos
        let admin = await get(`SELECT id_administrador FROM administradores LIMIT 1`);
        if (!admin) {
            const resAdmin = await run(
                `INSERT INTO administradores (nombre, numero_whatsapp) VALUES (?, ?)`,
                ['Admin Pruebas', '573000000000']
            );
            admin = { id_administrador: resAdmin.id };
        }

        // 2. Crear dos eventos diferentes
        const idEvento1 = await crearEvento({
            id_administrador: admin.id_administrador,
            nombre: 'Concierto Estadio Atanasio',
            descripcion: 'Logística de puertas y acomodación',
            ubicacion: 'Medellín',
            fecha_evento: '2026-12-05',
            hora_inicio: '14:00',
            hora_fin: '23:00',
            cupo: 2
        });

        const idEvento2 = await crearEvento({
            id_administrador: admin.id_administrador,
            nombre: 'Feria Empresarial Plaza Mayor',
            descripcion: 'Registro y control de acceso',
            ubicacion: 'Medellín',
            fecha_evento: '2026-12-12',
            hora_inicio: '08:00',
            hora_fin: '18:00',
            cupo: 5
        });

        console.log(`Eventos creados: ID ${idEvento1} y ID ${idEvento2}`);

        // 3. Agregar preguntas al Evento 1
        const idPreg1 = await agregarPreguntaEvento(idEvento1, '¿Tiene curso de alturas vigente?', 'SI_NO', null, 1, 1);
        const idPreg2 = await agregarPreguntaEvento(idEvento1, 'Talla de camiseta', 'TEXTO', null, 1, 2);

        // 4. Registrar personas de prueba
        const idPersona1 = await registrarPersona({
            nombre_completo: 'Carlos Pérez',
            numero_documento: '1001001001',
            numero_whatsapp: '573111111111'
        });

        const idPersona2 = await registrarPersona({
            nombre_completo: 'Laura Gómez',
            numero_documento: '1002002002',
            numero_whatsapp: '573222222222'
        });

        // 5. Registrar solicitudes en ambos eventos y guardar respuestas
        const idSol1 = await registrarSolicitud(idPersona1, idEvento1, 'REGISTRADO');
        await guardarRespuesta(idSol1, idPreg1, 'SI');
        await guardarRespuesta(idSol1, idPreg2, 'L');
        await cambiarEstadoSolicitud(idSol1, 'SELECCIONADO');

        const idSol2 = await registrarSolicitud(idPersona2, idEvento1, 'DISPONIBLE');
        await guardarRespuesta(idSol2, idPreg1, 'NO');
        await guardarRespuesta(idSol2, idPreg2, 'M');

        // Solicitud en Evento 2 y retiro sin borrar historial
        await registrarSolicitud(idPersona1, idEvento2, 'DISPONIBLE');
        await retirarSolicitud(idPersona1, idEvento2);

        // 6. Probar consultas por evento
        const activos = await consultarEventos(true);
        console.log(`Total eventos abiertos en BD: ${activos.length}`);

        const reporte1 = await consultarReporteEvento(idEvento1);
        console.log(`Reporte Evento 1 (${reporte1.evento.nombre}): ${reporte1.totalRegistros} solicitudes.`);

        const reporte2 = await consultarReporteEvento(idEvento2);
        console.log(`Reporte Evento 2 (${reporte2.evento.nombre}): ${reporte2.totalRegistros} solicitudes (incluye retirados en historial).`);

        // 7. Verificar consistencia
        const consistencia = await verificarConsistenciaEvento(idEvento1);
        console.log('Resultado consistencia Evento 1:', consistencia);

        // 8. Exportar a CSV
        const csv1 = await exportarEventoCSV(idEvento1);
        const csv2 = await exportarEventoCSV(idEvento2);
        console.log('CSV Evento 1 generado en:', csv1.rutaArchivo);
        console.log('CSV Evento 2 generado en:', csv2.rutaArchivo);

        console.log('--- TODAS LAS PRUEBAS PASARON EXITOSAMENTE ---');
    } catch (error) {
        console.error('Error durante las pruebas:', error.message);
    }
}

ejecutarPruebas();