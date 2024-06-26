const PORT = process.env.PORT || 3000
const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:5000"
const DATABASE_HOST = process.env.DATABASE_HOST || ""
const DATABASE_PORT = process.env.DATABASE_PORT || ""
const DATABASE_DB = process.env.DATABASE_DB || ""
const DATABASE_USER = process.env.DATABASE_USER || ""
const DATABASE_PASSWORD = process.env.DATABASE_PASSWORD || ""
const SRID = process.env.SRID || "3857"
const PROFILES_PATH = process.env.PROFILES_PATH || "/opt"
const ROUTE_DATA_PATH = process.env.ROUTE_DATA_PATH || "./route-data.osm"

module.exports = {
    PORT,
    BACKEND_URL,
    DATABASE_HOST,
    DATABASE_PORT,
    DATABASE_DB,
    DATABASE_USER,
    DATABASE_PASSWORD,
    SRID,
    PROFILES_PATH,
    ROUTE_DATA_PATH
}
