#include <iostream>
#include <string>
#include <unordered_map>
#include <vector>
#include <cmath>
#include <stdexcept>
#include <cstdint>
#include <cstring>

auto read_int() -> uint32_t
{
    char buffer[4];
    std::cin.read(buffer, 4);
    return (static_cast<uint8_t>(buffer[0])) |
           (static_cast<uint8_t>(buffer[1]) << 8) |
           (static_cast<uint8_t>(buffer[2]) << 16) |
           (static_cast<uint8_t>(buffer[3]) << 24);
}

auto read_byte() -> uint8_t
{
    char byte;
    std::cin.read(&byte, 1);
    return static_cast<uint8_t>(byte);
}

auto read_double() -> double
{
    uint8_t buffer[8];
    std::cin.read(reinterpret_cast<char *>(buffer), 8);
    uint64_t raw = 0;
    for (int i = 7; i >= 0; --i)
    {
        raw = (raw << 8) | buffer[i];
    }
    double value;
    std::memcpy(&value, &raw, sizeof(double));
    return value;
}

auto read_string() -> std::string
{
    const auto length = read_int();
    std::string result(length, '\0');
    std::cin.read(&result[0], length);
    return result;
}

constexpr auto to_rad(double degrees) -> double
{
    return degrees * (M_PI / 180.0);
}

auto get_haversine_distance(double lat1, double lon1, double lat2, double lon2) -> double
{
    constexpr auto R = 6371000.0;

    const auto φ1 = to_rad(lat1);
    const auto φ2 = to_rad(lat2);
    const auto Δφ = to_rad(lat2 - lat1);
    const auto Δλ = to_rad(lon2 - lon1);

    const auto a = std::sin(Δφ / 2) * std::sin(Δφ / 2) +
                   std::cos(φ1) * std::cos(φ2) *
                       std::sin(Δλ / 2) * std::sin(Δλ / 2);

    const auto c = 2 * std::atan2(std::sqrt(a), std::sqrt(1 - a));

    return R * c;
}

struct s_node
{
    uint32_t id;
    uint32_t lat; // stored in E7
    uint32_t lon; // stored in E7
    double lat_f; // degrees
    double lon_f; // degrees
    int count = 0;
    void *last_way = nullptr;
};

class c_way
{
public:
    uint32_t m_id;
    std::vector<s_node *> m_nodes;
    std::string m_name;

    s_node &get_start_point()
    {
        return *this->m_nodes[0];
    }

    s_node &get_end_point()
    {
        return *this->m_nodes[this->m_nodes.size() - 1];
    }
};

constexpr auto bin_size = 0.001;

inline auto pack_key(int x, int y) -> int64_t
{
    return (static_cast<int64_t>(x) << 32) | (static_cast<uint32_t>(y));
}

inline auto get_bin_key(double lat_deg, double lon_deg) -> std::pair<int, int>
{
    return {static_cast<int>(lat_deg / bin_size),
            static_cast<int>(lon_deg / bin_size)};
}

auto main() -> int
{
    const auto min_dist = read_double();
    const auto max_dist = read_double();
    const auto same_name = read_byte() != 0;

    const auto node_count = read_int();
    std::vector<s_node> nodes(node_count);
    std::unordered_map<uint32_t, s_node *> node_map;

    for (auto i = 0; i < node_count; ++i)
    {
        nodes[i].id = read_int();
        nodes[i].lat = read_int();
        nodes[i].lon = read_int();
        nodes[i].lat_f = nodes[i].lat / 1e7;
        nodes[i].lon_f = nodes[i].lon / 1e7;
        node_map.emplace(nodes[i].id, &nodes[i]);
    }

    const auto ways_count = read_int();
    std::vector<c_way> ways(ways_count);

    std::vector<s_node *> deadends;

    for (auto i = 0; i < ways_count; ++i)
    {
        ways[i].m_id = read_int();
        const auto way_node_count = read_int();
        ways[i].m_nodes.resize(way_node_count);
        for (auto j = 0; j < way_node_count; ++j)
        {
            const auto id = read_int();
            const auto it = node_map.find(id);
            if (it == node_map.end())
                throw std::runtime_error("Node ID not found for way");

            auto node = it->second;
            ++node->count;
            node->last_way = &ways[i];
            ways[i].m_nodes[j] = node;
        }
        ways[i].m_name = read_string();
    }

    for (auto &way : ways)
    {
        if (way.get_start_point().count == 1)
        {
            deadends.push_back(&way.get_start_point());
        }
        if (way.get_end_point().count == 1)
        {
            deadends.push_back(&way.get_end_point());
        }
    }

    std::unordered_map<int64_t, std::vector<c_way *>> way_bins;

    for (auto &way : ways)
    {
        auto sum_lat = 0.0;
        auto sum_lon = 0.0;
        for (auto *node : way.m_nodes)
        {
            sum_lat += node->lat_f;
            sum_lon += node->lon_f;
        }
        const auto avg_lat = sum_lat / way.m_nodes.size();
        const auto avg_lon = sum_lon / way.m_nodes.size();

        const auto [x, y] = get_bin_key(avg_lat, avg_lon);
        const auto key = pack_key(x, y);
        way_bins[key].push_back(&way);
    }

    for (auto &node : deadends)
    {
        if (node->count != 1)
            continue;

        const auto lat0 = node->lat_f;
        const auto lon0 = node->lon_f;

        const auto last_way = reinterpret_cast<c_way *>(node->last_way);

        const auto [x0, y0] = get_bin_key(lat0, lon0);

        for (auto dx = -1; dx <= 1; ++dx)
        {
            for (auto dy = -1; dy <= 1; ++dy)
            {
                const auto key = pack_key(x0 + dx, y0 + dy);
                const auto it = way_bins.find(key);
                if (it == way_bins.end())
                    continue;

                for (auto way : it->second)
                {
                    if (way->m_id == last_way->m_id)
                        continue;
                    if (same_name && way->m_name != last_way->m_name)
                        continue;

                    if (way->get_start_point().id != node->id)
                    {
                        const auto dist = get_haversine_distance(lat0,
                                                                 lon0,
                                                                 way->get_start_point().lat_f,
                                                                 way->get_start_point().lon_f);
                        if (dist < min_dist || dist > max_dist)
                            continue;

                        std::cout << node->id
                                  << "," << node->lat
                                  << "," << node->lon
                                  << "," << way->get_start_point().id
                                  << "," << way->get_start_point().lat
                                  << "," << way->get_start_point().lon
                                  << "," << dist
                                  << std::endl;
                    }

                    if (way->get_end_point().id != node->id)
                    {
                        const auto dist = get_haversine_distance(lat0,
                                                                 lon0,
                                                                 way->get_end_point().lat_f,
                                                                 way->get_end_point().lon_f);
                        if (dist < min_dist || dist > max_dist)
                            continue;

                        std::cout << node->id
                                  << "," << node->lat
                                  << "," << node->lon
                                  << "," << way->get_end_point().id
                                  << "," << way->get_end_point().lat
                                  << "," << way->get_end_point().lon
                                  << "," << dist
                                  << std::endl;
                    }
                }
            }
        }
    }

    std::cout << "::" << std::endl;
    return 0;
}
