const { run, get } = require('./db');

async function registrarPersona({ nombre_completo, numero_documento, numero_whatsapp }) {
    const existente = await get(`SELECT id FROM personas WHERE numero_documento = ?`, [numero_documento]);
    
    if (existente) {
        await run(
            `UPDATE personas SET nombre_completo = ?, numero_whatsapp = ? WHERE id = ?`,
            [nombre_completo, numero_whatsapp, existente.id]
        );
        return existente.id;
    }

    const sql = `
        INSERT INTO personas (nombre_completo, numero_documento, numero_whatsapp)
        VALUES (?, ?, ?)
    `;
    const result = await run(sql, [nombre_completo, numero_documento, numero_whatsapp]);
    return result.id;
}

async function buscarPersonaPorWhatsapp(numero_whatsapp) {
    return await get(`SELECT * FROM personas WHERE numero_whatsapp = ?`, [numero_whatsapp]);
}

async function esAdministrador(numero_whatsapp) {
    const admin = await get(`SELECT * FROM administradores WHERE numero_whatsapp = ? AND activo = 1`, [numero_whatsapp]);
    return !!admin;
}

module.exports = {
    registrarPersona,
    buscarPersonaPorWhatsapp,
    esAdministrador
};