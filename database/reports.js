const fs = require('fs');
const path = require('path');
const { get, all } = require('./db');

function escaparCSV(valor) {
    if (valor === null || valor === undefined) return '';
    const texto = String(valor);
    if (texto.includes(',') || texto.includes('"') || texto.includes('\n')) {
        return `"${texto.replace(/"/g, '""')}"`;
    }
    return texto;
}

// 1. Consulta completa por evento (resumen por estado + listado de postulados)
async function consultarReporteEvento(id_evento, filtroEstado = null) {
    const evento = await get(`SELECT * FROM eventos WHERE id_evento = ?`, [id_evento]);
    if (!evento) {
        throw new Error(`No existe ningún evento con id_evento = ${id_evento}`);
    }

    const resumenEstados = await all(
        `SELECT estado, COUNT(*) AS total 
         FROM solicitudes 
         WHERE id_evento = ? 
         GROUP BY estado`,
        [id_evento]
    );

    let sqlPostulados = `
        SELECT s.id_solicitud, s.estado, s.fecha_registro, s.fecha_actualizacion,
               p.id_persona, p.nombre_completo, p.numero_documento, p.numero_whatsapp
        FROM solicitudes s
        INNER JOIN personas p ON s.id_persona = p.id_persona
        WHERE s.id_evento = ?
    `;
    const params = [id_evento];

    if (filtroEstado) {
        sqlPostulados += ` AND s.estado = ?`;
        params.push(filtroEstado);
    }

    sqlPostulados += ` ORDER BY s.fecha_registro ASC`;
    const postulados = await all(sqlPostulados, params);

    return {
        evento,
        resumenEstados,
        totalRegistros: postulados.length,
        postulados
    };
}

// 2. Verificar consistencia de los registros de un evento
async function verificarConsistenciaEvento(id_evento) {
    const evento = await get(`SELECT * FROM eventos WHERE id_evento = ?`, [id_evento]);
    if (!evento) {
        throw new Error(`No existe ningún evento con id_evento = ${id_evento}`);
    }

    const alertas = [];

    // Verificar si los seleccionados superan el cupo del evento
    const seleccionados = await get(
        `SELECT COUNT(*) AS total FROM solicitudes WHERE id_evento = ? AND estado = 'SELECCIONADO'`,
        [id_evento]
    );
    if (seleccionados.total > evento.cupo) {
        alertas.push(`Sobrecupo: hay ${seleccionados.total} seleccionados pero el cupo es ${evento.cupo}.`);
    }

    const sinRespuestasObligatorias = await all(
        `SELECT s.id_solicitud, p.nombre_completo, pr.texto AS pregunta_faltante
         FROM solicitudes s
         INNER JOIN personas p ON s.id_persona = p.id_persona
         INNER JOIN preguntas pr ON pr.id_evento = s.id_evento AND pr.obligatoria = 1
         LEFT JOIN respuestas r ON r.id_solicitud = s.id_solicitud AND r.id_pregunta = pr.id_pregunta
         WHERE s.id_evento = ? 
           AND s.estado IN ('REGISTRADO', 'DISPONIBLE', 'SELECCIONADO')
           AND (r.valor IS NULL OR TRIM(r.valor) = '')`,
        [id_evento]
    );

    if (sinRespuestasObligatorias.length > 0) {
        alertas.push(`Hay ${sinRespuestasObligatorias.length} respuesta(s) obligatoria(s) incompleta(s) en solicitudes activas.`);
    }

    return {
        id_evento: evento.id_evento,
        nombre_evento: evento.nombre,
        cupo_maximo: evento.cupo,
        total_seleccionados: seleccionados.total,
        consistente: alertas.length === 0,
        alertas,
        detalle_faltantes: sinRespuestasObligatorias
    };
}

// 3. Generar archivo CSV por evento (incluye columnas dinámicas con las preguntas y respuestas del evento)
async function exportarEventoCSV(id_evento, filtroEstado = null, rutaPersonalizada = null) {
    const reporte = await consultarReporteEvento(id_evento, filtroEstado);
    const preguntas = await all(
        `SELECT id_pregunta, texto FROM preguntas WHERE id_evento = ? ORDER BY orden ASC`,
        [id_evento]
    );

    const encabezados = [
        'ID Solicitud',
        'ID Persona',
        'Nombre Completo',
        'Numero Documento',
        'WhatsApp',
        'Estado',
        'Fecha Registro',
        ...preguntas.map(pr => pr.texto)
    ];

    const filas = [encabezados.map(escaparCSV).join(',')];

    for (const postulado of reporte.postulados) {
        const respuestas = await all(
            `SELECT id_pregunta, valor FROM respuestas WHERE id_solicitud = ?`,
            [postulado.id_solicitud]
        );
        const mapaRespuestas = new Map(respuestas.map(r => [r.id_pregunta, r.valor]));

        const fila = [
            postulado.id_solicitud,
            postulado.id_persona,
            postulado.nombre_completo,
            postulado.numero_documento,
            postulado.numero_whatsapp,
            postulado.estado,
            postulado.fecha_registro,
            ...preguntas.map(pr => mapaRespuestas.get(pr.id_pregunta) || '')
        ];

        filas.push(fila.map(escaparCSV).join(','));
    }

    // Definir carpeta y nombre del archivo
    const carpetaReportes = path.resolve(__dirname, 'reportes_csv');
    if (!fs.existsSync(carpetaReportes)) {
        fs.mkdirSync(carpetaReportes, { recursive: true });
    }

    const nombreLimpio = reporte.evento.nombre.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    const sufijoEstado = filtroEstado ? `_${filtroEstado.toLowerCase()}` : '_todos';
    const rutaArchivo = rutaPersonalizada || path.join(carpetaReportes, `evento_${id_evento}_${nombreLimpio}${sufijoEstado}.csv`);

    const contenidoCSV = '\uFEFF' + filas.join('\n');
    fs.writeFileSync(rutaArchivo, contenidoCSV, 'utf8');

    return {
        rutaArchivo,
        totalExportados: reporte.postulados.length
    };
}

module.exports = {
    consultarReporteEvento,
    verificarConsistenciaEvento,
    exportarEventoCSV
};