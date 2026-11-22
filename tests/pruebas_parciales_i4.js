const assert = require('assert');
const {
    convertirFecha,
    validarHora,
    validarTexto,
    validarNumeroPositivo,
    validarSiNo,
    normalizarSiNo
} = require('../src/whatsapp/conversation/validators');

const { crearWorkerFlows } = require('../src/whatsapp/conversation/workerFlows');

console.log("=== INICIANDO PRUEBAS PARCIALES - INTEGRANTE 4 ===\n");

async function ejecutarPrueba(id, descripcion, fn) {
    try {
        await fn();
        console.log(`[PASS] ${id}: ${descripcion}`);
    } catch (error) {
        console.log(`[FAIL] ${id}: ${descripcion}`);
        console.log(`       Detalle: ${error.message}`);
    }
}

const workerFlows = crearWorkerFlows({
    obtenerMenu: () => '[MENU PRINCIPAL]',
    regresarMenu: (sesion) => { sesion.flujo = null; sesion.etapa = null; }
});

(async () => {
    await ejecutarPrueba('CP-VL-01', 'Validar formato de fecha correcto y futuro (RN 12)', () => {
        assert.strictEqual(convertirFecha('25/12/2026'), '2026-12-25');
    });

    await ejecutarPrueba('CP-VL-02', 'Rechazar fecha pasada o formato inválido (RN 12)', () => {
        assert.strictEqual(convertirFecha('01/01/2020'), null);
        assert.strictEqual(convertirFecha('2026-12-25'), null);
    });

    await ejecutarPrueba('CP-VL-03', 'Validar cupo entero positivo mayor a 0 (RN 13)', () => {
        assert.strictEqual(validarNumeroPositivo('10'), true);
        assert.strictEqual(validarNumeroPositivo('0'), false);
        assert.strictEqual(validarNumeroPositivo('-5'), false);
    });

    await ejecutarPrueba('CP-VL-04', 'Validar respuestas SI/NO con y sin tilde (V-02, V-03)', () => {
        assert.strictEqual(validarSiNo('sí'), true);
        assert.strictEqual(validarSiNo('NO'), true);
        assert.strictEqual(normalizarSiNo('sí'), 'SI');
        assert.strictEqual(validarSiNo('tal vez'), false);
    });

    await ejecutarPrueba('CP-VL-05', 'Rechazar texto vacío en respuestas obligatorias (V-04)', () => {
        assert.strictEqual(validarTexto('   '), false);
        assert.strictEqual(validarTexto('Juan Pérez'), true);
    });

    await ejecutarPrueba('CP-WF-01', 'Rechazar documento inválido en DATOS_PERSONALES', async () => {
        const sesion = {
            rol: 'TRABAJADOR',
            flujo: 'INSCRIBIR_EVENTO',
            etapa: 'DATOS_PERSONALES',
            datosInscripcion: { numero_whatsapp: '573001112233' }
        };
        const resp = await workerFlows.procesarInscripcion(sesion, '1. Carlos Ruiz\n2. 123');
        assert(resp.includes('entre 5 y 15 dígitos'), 'Debió rechazar documento corto');
    });

    await ejecutarPrueba('CP-V02-2', 'Disponibilidad horaria: si responde NO, cancela y vuelve al menú', async () => {
        const sesion = {
            rol: 'TRABAJADOR',
            flujo: 'INSCRIBIR_EVENTO',
            etapa: 'ACEPTAR_FECHAS',
            datosInscripcion: {}
        };
        const resp = await workerFlows.procesarInscripcion(sesion, 'NO');
        assert(resp.includes('No se guardó ninguna información'), 'Debió cancelar la inscripción');
        assert.strictEqual(sesion.flujo, null);
    });

    await ejecutarPrueba('CP-V01-2', 'Validación obligatoria de mayoría de edad (>= 18 años) (V-01 / RN 19)', async () => {
        const sesion = {
            rol: 'TRABAJADOR',
            flujo: 'INSCRIBIR_EVENTO',
            etapa: 'DATOS_PERSONALES',
            datosInscripcion: {
                numero_whatsapp: '573001112233',
                evento: { id_evento: 1, nombre: 'Evento Prueba' },
                fechas: ['2026-12-25']
            }
        };
        const resp = await workerFlows.procesarInscripcion(sesion, '1. Pedro Gomez\n2. 1020304050\n3. 16');
        assert(resp.includes('mayor de edad') || resp.includes('NO_CUMPLE'), 'HALLAZGO: workerFlows aún no solicita ni valida edad >= 18');
    });

    await ejecutarPrueba('CP-V04-3', 'Cancelar inscripción tras 3 intentos fallidos en pregunta obligatoria (V-04 / RN 17)', async () => {
        const sesion = {
            rol: 'TRABAJADOR',
            flujo: 'INSCRIBIR_EVENTO',
            etapa: 'PREGUNTAS',
            datosInscripcion: {
                indicePregunta: 0,
                preguntas: [{ texto: '¿Tiene curso de alturas?', tipo_respuesta: 'SI_NO', obligatoria: 1 }],
                respuestas: []
            }
        };
        await workerFlows.procesarInscripcion(sesion, 'quizas');
        await workerFlows.procesarInscripcion(sesion, 'no se');
        const tercerIntento = await workerFlows.procesarInscripcion(sesion, 'tal vez');
        assert(tercerIntento.includes('cancelada') || sesion.flujo === null, 'HALLAZGO: workerFlows repite infinitamente sin cortar al 3er intento');
    });

    console.log("\n=== FIN DE EJECUCIÓN ===");
})();
