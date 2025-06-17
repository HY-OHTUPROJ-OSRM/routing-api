#include <iostream>
#include <string>
#include <cmath>
#include <vector>
#include <set>
#include <queue>
#include <unordered_map>
#include <unordered_set>
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
    for (auto i = 7; i >= 0; --i)
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
    constexpr auto r = 6371000.0;

    const auto lat1_rad = to_rad(lat1);
    const auto lat2_rad = to_rad(lat2);
    const auto dlat_rad = to_rad(lat2 - lat1);
    const auto d_lon_rad = to_rad(lon2 - lon1);

    const auto a = std::sin(dlat_rad / 2.0) * std::sin(dlat_rad / 2.0) + std::cos(lat1_rad) * std::cos(lat2_rad) * std::sin(d_lon_rad / 2.0) * std::sin(d_lon_rad / 2.0);

    const auto c = 2.0 * std::atan2(std::sqrt(a), std::sqrt(1 - a));

    return r * c;
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
    bool deadend = false;
    std::unordered_set<s_node *> neighbors;
};

class c_way
{
public:
    uint32_t m_id;
    std::vector<s_node *> m_nodes;
    std::string m_name;
    std::string m_highway;
    uint32_t m_city_code;

    s_node *get_start_point()
    {
        return this->m_nodes[0];
    }

    s_node *get_end_point()
    {
        return this->m_nodes[this->m_nodes.size() - 1];
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

auto bfs_distance(s_node *start, s_node *goal) -> int
{
    if (start == goal)
        return 0;

    std::queue<std::pair<s_node *, int>> q;
    std::unordered_set<uint32_t> visited;

    q.push({start, 0});
    visited.insert(start->id);

    while (!q.empty())
    {
        const auto [current, distance] = q.front();
        q.pop();

        for (auto neighbor : current->neighbors)
        {
            if (visited.count(neighbor->id))
                continue;
            if (neighbor == goal)
                return distance + 1;

            visited.insert(neighbor->id);
            q.push({neighbor, distance + 1});
        }
    }

    return -1;
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

    auto fixed_way_count = 0;
    for (auto i = 0; i < ways_count; ++i)
    {
        ways[fixed_way_count].m_id = read_int();
        const auto way_node_count = read_int();
        ways[fixed_way_count].m_nodes.resize(way_node_count);
        for (auto j = 0; j < way_node_count; ++j)
        {
            const auto id = read_int();
            const auto it = node_map.find(id);
            if (it == node_map.end())
                throw std::runtime_error("Node ID not found for way");

            const auto node = it->second;
            ++node->count;
            node->last_way = &ways[fixed_way_count];
            ways[fixed_way_count].m_nodes[j] = node;
        }
        ways[fixed_way_count].m_name = read_string();
        ways[fixed_way_count].m_highway = read_string();
        ways[fixed_way_count].m_city_code = read_int();

        if (ways[fixed_way_count].m_highway == "footway")
        {
            continue;
        }

        ++fixed_way_count;
    }
    ways.resize(fixed_way_count);

    for (auto i = 0; i < fixed_way_count; ++i)
    {
        const auto &way = ways[i];

        for (auto j = 1; j < way.m_nodes.size(); ++j)
        {
            const auto a = way.m_nodes[j - 1];
            const auto b = way.m_nodes[j];
            a->neighbors.insert(b);
            b->neighbors.insert(a);
        }
    }

    for (auto &way : ways)
    {
        const auto start_node = way.get_start_point();
        const auto end_node = way.get_end_point();
        if (start_node->count == 1 && !start_node->deadend)
        {
            start_node->deadend = true;
            deadends.push_back(start_node);
        }
        if (end_node->count == 1 && !end_node->deadend)
        {
            end_node->deadend = true;
            deadends.push_back(end_node);
        }
    }

    std::unordered_map<int64_t, std::vector<c_way *>> way_bins;

    for (auto &way : ways)
    {
        auto sum_lat = 0.0;
        auto sum_lon = 0.0;
        for (auto node : way.m_nodes)
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

    for (auto node : deadends)
    {
        const auto lat0 = node->lat_f;
        const auto lon0 = node->lon_f;

        const auto last_way = reinterpret_cast<c_way *>(node->last_way);

        const auto [x0, y0] = get_bin_key(lat0, lon0);

        std::set<int> visited;
        const auto process_node = [&](s_node *node, s_node *start_node, c_way *way) -> void
        {
            if (start_node->id == node->id)
                return;

            if (visited.find(node->id) != visited.end())
                return;

            const auto dist = get_haversine_distance(lat0, lon0, start_node->lat_f, start_node->lon_f);

            if (dist < min_dist || dist > max_dist)
                return;

            if (bfs_distance(node, start_node) >= 0)
                return;

            visited.insert(node->id);
            std::cout << node->id
                      << "," << last_way->m_name
                      << "," << node->lat
                      << "," << node->lon
                      << "," << start_node->id
                      << "," << way->m_name
                      << "," << start_node->lat
                      << "," << start_node->lon
                      << "," << dist
                      << "," << last_way->m_city_code
                      << std::endl;
        };

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

                    const auto start_point = way->get_start_point();
                    const auto end_point = way->get_end_point();
                    if (last_way->get_start_point()->id == start_point->id ||
                        last_way->get_start_point()->id == end_point->id ||
                        last_way->get_end_point()->id == start_point->id ||
                        last_way->get_end_point()->id == end_point->id)
                    {
                        continue;
                    }

                    process_node(node, start_point, way);
                    process_node(node, end_point, way);
                }
            }
        }
    }

    std::cout << "::" << std::endl;
    return 0;
}
