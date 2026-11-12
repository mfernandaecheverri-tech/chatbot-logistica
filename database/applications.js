const { run, get, all } = require('./db');

async function registrarSolicitud(persona_id, evento_id, estadoInicial = 'REGISTRADO') {
    const existente = await get(
        `SELECT * FROM solicitudes WHERE persona_id = ? AND evento_id = ?`,
        [persona_id, evento_id]
    );

    if (existente) {
        if (existente.estado === 'RETIRADO') {
            await cambiarEstadoSolicitud(existente.id, estadoInicial);
            return existente.id;
        }
        throw new Error('La persona ya tiene una solicitud activa para este evento.');
    }

    const sql = `INSERT INTO solicitudes (persona_id, evento_id, estado) VALUES (?, ?, ?)`;
    const result = await run(sql, [persona_id, evento_id, estadoInicial]);
    return result.id;
}

async function guardarRespuesta(solicitud_id, pregunta_id, respuesta) {
    const sql = `
        INSERT INTO respuestas (solicitud_id, pregunta_id, respuesta)
        VALUES (?, ?, ?)
        ON CONFLICT(solicitud_id, pregunta_id) DO UPDATE SET respuesta = excluded.respuesta
    `;
    const result = await run(sql, [solicitud_id, pregunta_id, respuesta]);
    return result.id;
}

async function cambiarEstadoSolicitud(solicitud_id, nuevoEstado) {
    const sql = `
        UPDATE solicitudes 
        SET estado = ?, fecha_actualizacion = CURRENT_TIMESTAMP 
        WHERE id = ?
    `;
    const result = await run(sql, [nuevoEstado, solicitud_id]);
    return result.changes;
}

async function consultarPersonasPorEstado(evento_id, estado = 'DISPONIBLE') {
    const sql = `
        SELECT p.id AS persona_id, p.nombre_completo, p.numero_documento, p.numero_whatsapp,
               s.id AS solicitud_id, s.estado, s.fecha_solicitud
        FROM solicitudes s
        INNER JOIN personas p ON s.persona_id = p.id
        WHERE s.evento_id = ? AND s.estado = ?
        ORDER BY s.fecha_solicitud ASC
    `;
    return await all(sql, [evento_id, estado]);
}

async function retirarSolicitud(persona_id, evento_id) {
    const sql = `
        UPDATE solicitudes 
        SET estado = 'RETIRADO', fecha_actualizacion = CURRENT_TIMESTAMP 
        WHERE persona_id = ? AND evento_id = ?
    `;
    const result = await run(sql, [persona_id, evento_id]);
    return result.changes;
}

module.exports = {
    registrarSolicitud,
    guardarRespuesta,
    cambiarEstadoSolicitud,
    consultarPersonasPorEstado,
    retirarSolicitud
};