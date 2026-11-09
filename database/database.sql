-- =========================================
-- BASE DE DATOS: CHATBOT LOGISTICA
-- =========================================

PRAGMA foreign_keys = ON;

-- 1. ADMINISTRADORES
CREATE TABLE IF NOT EXISTS administradores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    numero_whatsapp TEXT NOT NULL UNIQUE,
    activo INTEGER DEFAULT 1,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. EVENTOS
CREATE TABLE IF NOT EXISTS eventos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT,
    ubicacion TEXT,
    fecha_evento TEXT NOT NULL,
    hora_inicio TEXT,
    hora_fin TEXT,
    cupos INTEGER NOT NULL,
    estado TEXT DEFAULT 'ACTIVO' CHECK (estado IN ('ACTIVO', 'CERRADO', 'CANCELADO')),
    administrador_id INTEGER,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (administrador_id) REFERENCES administradores(id)
);

-- 3. PERSONAS
CREATE TABLE IF NOT EXISTS personas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre_completo TEXT NOT NULL,
    numero_documento TEXT NOT NULL UNIQUE,
    numero_whatsapp TEXT NOT NULL,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 4. SOLICITUDES
CREATE TABLE IF NOT EXISTS solicitudes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    persona_id INTEGER NOT NULL,
    evento_id INTEGER NOT NULL,
    estado TEXT DEFAULT 'REGISTRADO' CHECK (estado IN (
        'INTERESADO',
        'REGISTRADO',
        'NO_CUMPLE',
        'DISPONIBLE',
        'RETIRADO',
        'SELECCIONADO',
        'ESPERA'
    )),
    fecha_solicitud DATETIME DEFAULT CURRENT_TIMESTAMP,
    fecha_actualizacion DATETIME DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (persona_id) REFERENCES personas(id),
    FOREIGN KEY (evento_id) REFERENCES eventos(id),

    UNIQUE(persona_id, evento_id)
);

-- 5. PREGUNTAS PERSONALIZADAS POR EVENTO
CREATE TABLE IF NOT EXISTS preguntas_evento (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    evento_id INTEGER NOT NULL,
    pregunta TEXT NOT NULL,
    tipo_respuesta TEXT DEFAULT 'TEXTO',
    opciones TEXT,
    obligatoria INTEGER DEFAULT 1,
    orden INTEGER DEFAULT 1,

    FOREIGN KEY (evento_id) REFERENCES eventos(id)
);

-- 6. RESPUESTAS DE LAS PERSONAS
CREATE TABLE IF NOT EXISTS respuestas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    solicitud_id INTEGER NOT NULL,
    pregunta_id INTEGER NOT NULL,
    respuesta TEXT,

    FOREIGN KEY (solicitud_id) REFERENCES solicitudes(id),
    FOREIGN KEY (pregunta_id) REFERENCES preguntas_evento(id),

    UNIQUE(solicitud_id, pregunta_id)
);

-- INDICES PARA OPTIMIZAR CONSULTAS
CREATE INDEX IF NOT EXISTS idx_eventos_estado ON eventos(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_evento ON solicitudes(evento_id);
CREATE INDEX IF NOT EXISTS idx_solicitudes_persona ON solicitudes(persona_id);