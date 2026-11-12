const { run, get, all } = require('./db');

async function crearEvento({ nombre, descripcion, ubicacion, fecha_evento, hora_inicio, hora_fin, cupos, administrador_id }) {
    const sql = `
        INSERT INTO eventos (nombre, descripcion, ubicacion, fecha_evento, hora_inicio, hora_fin, cupos, administrador_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await run(sql, [nombre, descripcion, ubicacion, fecha_evento, hora_inicio, hora_fin, cupos, administrador_id]);
    return result.id;
}

async function consultarEventos(soloActivos = true) {
    const sql = soloActivos 
        ? `SELECT * FROM eventos WHERE estado = 'ACTIVO' ORDER BY fecha_evento ASC`
        : `SELECT * FROM eventos ORDER BY fecha_evento ASC`;
    return await all(sql);
}

async function obtenerEventoPorId(id) {
    return await get(`SELECT * FROM eventos WHERE id = ?`, [id]);
}

async function actualizarEvento(id, datos) {
    const campos = [];
    const valores = [];

    for (const [clave, valor] of Object.entries(datos)) {
        if (valor !== undefined) {
            campos.push(`${clave} = ?`);
            valores.push(valor);
        }
    }
    if (campos.length === 0) return 0;

    valores.push(id);
    const sql = `UPDATE eventos SET ${campos.join(', ')} WHERE id = ?`;
    const result = await run(sql, valores);
    return result.changes;
}

async function agregarPreguntaEvento(evento_id, pregunta, tipo_respuesta = 'TEXTO', opciones = null, obligatoria = 1, orden = 1) {
    const sql = `
        INSERT INTO preguntas_evento (evento_id, pregunta, tipo_respuesta, opciones, obligatoria, orden)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    const result = await run(sql, [evento_id, pregunta, tipo_respuesta, opciones, obligatoria, orden]);
    return result.id;
}

async function obtenerPreguntasEvento(evento_id) {
    return await all(`SELECT * FROM preguntas_evento WHERE evento_id = ? ORDER BY orden ASC`, [evento_id]);
}

module.exports = {
    crearEvento,
    consultarEventos,
    obtenerEventoPorId,
    actualizarEvento,
    agregarPreguntaEvento,
    obtenerPreguntasEvento
};