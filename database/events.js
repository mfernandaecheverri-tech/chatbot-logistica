const { run, get, all } = require('./db');
o
async function crearEvento({ nombre, descripcion, ubicacion, fecha_evento, hora_inicio, hora_fin, cupo, id_administrador }) {
    const sql = `
        INSERT INTO eventos (id_administrador, nombre, descripcion, ubicacion, fecha_evento, hora_inicio, hora_fin, cupo)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const result = await run(sql, [id_administrador, nombre, descripcion, ubicacion, fecha_evento, hora_inicio, hora_fin, cupo]);
    return result.id;
}

async function consultarEventos(soloAbiertos = true) {
    const sql = soloAbiertos 
        ? `SELECT * FROM eventos WHERE estado = 'ABIERTO' ORDER BY fecha_evento ASC`
        : `SELECT * FROM eventos ORDER BY fecha_evento ASC`;
    return await all(sql);
}

async function obtenerEventoPorId(id_evento) {
    return await get(`SELECT * FROM eventos WHERE id_evento = ?`, [id_evento]);
}

async function actualizarEvento(id_evento, datos) {
    const campos = [];
    const valores = [];

    for (const [clave, valor] of Object.entries(datos)) {
        if (valor !== undefined) {
            campos.push(`${clave} = ?`);
            valores.push(valor);
        }
    }
    if (campos.length === 0) return 0;

    valores.push(id_evento);
    const sql = `UPDATE eventos SET ${campos.join(', ')} WHERE id_evento = ?`;
    const result = await run(sql, valores);
    return result.changes;
}

async function agregarPreguntaEvento(id_evento, texto, tipo_respuesta = 'TEXTO', opciones = null, obligatoria = 1, orden = 1) {
    const sql = `
        INSERT INTO preguntas (id_evento, texto, tipo_respuesta, opciones, obligatoria, orden)
        VALUES (?, ?, ?, ?, ?, ?)
    `;
    const result = await run(sql, [id_evento, texto, tipo_respuesta, opciones, obligatoria, orden]);
    return result.id;
}

async function obtenerPreguntasEvento(id_evento) {
    return await all(`SELECT * FROM preguntas WHERE id_evento = ? ORDER BY orden ASC`, [id_evento]);
}

module.exports = {
    crearEvento,
    consultarEventos,
    obtenerEventoPorId,
    actualizarEvento,
    agregarPreguntaEvento,
    obtenerPreguntasEvento
};