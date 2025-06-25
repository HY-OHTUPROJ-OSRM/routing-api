const WMTS_CAPABILITIES_URL =
  "https://avoin-karttakuva.maanmittauslaitos.fi/avoin/wmts/1.0.0/WMTSCapabilities.xml";

class MmlTileRepository {
  async fetchLayers() {
    const res = await fetch(WMTS_CAPABILITIES_URL);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Failed to fetch WMTS capabilities: ${res.status}\n${text}`);
    }

    const xmlText = await res.text();
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, "application/xml");

    const layerElements = xml.getElementsByTagName("Layer");
    const layers = [];

    for (let i = 0; i < layerElements.length; i++) {
      const layerEl = layerElements[i];
      const identifier = layerEl.getElementsByTagName("ows:Identifier")[0]?.textContent;
      const title = layerEl.getElementsByTagName("ows:Title")[0]?.textContent;
      const tileMatrixSet = Array.from(layerEl.getElementsByTagName("TileMatrixSetLink"))
        .map(link => link.getElementsByTagName("TileMatrixSet")[0]?.textContent)
        .filter(Boolean);
      const formats = Array.from(layerEl.getElementsByTagName("Format")).map(f => f.textContent);

      layers.push({
        identifier,
        title,
        tileMatrixSet,
        formats
      });
    }

    return layers;
  }
}

module.exports = MmlTileRepository;
