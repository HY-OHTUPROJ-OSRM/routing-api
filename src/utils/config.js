const PORT = process.env.PORT || 3000
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000"
const DATABASE_USER = process.env.DATABASE_USER || ""
const DATABASE_HOST = process.env.DATABASE_HOST || ""
const DATABASE_PORT = process.env.DATABASE_PORT || ""
const SRID = process.env.SRID || "3857"

module.exports = {
    PORT,
    BACKEND_URL,
    DATABASE_USER, DATABASE_HOST, DATABASE_PORT,
    SRID
}
