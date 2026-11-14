package app;

import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.*;
import org.apache.commons.csv.CSVFormat;
import org.apache.commons.csv.CSVRecord;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

@Service
public class Forecast {
    record Route(String route, String name, BigDecimal base_price, BigDecimal cost_per_passenger,
                 BigDecimal price_sensitivity, BigDecimal price_min, BigDecimal price_max) {}
    record Row(String route, LocalDate date, int seats, List<BigDecimal> base) {}

    final Map<String, Route> routes = new LinkedHashMap<>();
    final Map<String, Row> rows = new LinkedHashMap<>();

    static List<CSVRecord> read(Resource resource, List<String> headers) throws Exception {
        try (var reader = new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8);
             var parser = CSVFormat.DEFAULT.builder().setHeader().setSkipHeaderRecord(true).get().parse(reader)) {
            if (!parser.getHeaderNames().equals(headers)) throw new IllegalArgumentException("Invalid CSV headers");
            var records = parser.getRecords();
            for (var record : records) {
                if (!record.isConsistent()) throw new IllegalArgumentException("Invalid CSV row");
            }
            return records;
        }
    }

    @org.springframework.beans.factory.annotation.Autowired
    Forecast() throws Exception {
        this(new ClassPathResource("data/routes.csv"), new ClassPathResource("data/my_forecast.csv"));
    }

    Forecast(Resource routeResource, Resource forecastResource) throws Exception {
        var routeRecords = read(routeResource, List.of("route", "name", "base_price", "cost_per_passenger",
                "price_sensitivity", "price_min", "price_max"));
        if (routeRecords.size() != 5) throw new IllegalArgumentException("Invalid routes count");
        for (var record : routeRecords) {
            var route = new Route(record.get(0), record.get(1), new BigDecimal(record.get(2)),
                    new BigDecimal(record.get(3)), new BigDecimal(record.get(4)),
                    new BigDecimal(record.get(5)), new BigDecimal(record.get(6)));
            if (route.route().isBlank() || route.name().isBlank() || !route.name().contains(" — ")
                    || route.base_price().signum() <= 0 || route.cost_per_passenger().signum() < 0
                    || route.price_sensitivity().signum() < 0 || route.price_min().signum() <= 0
                    || route.price_min().compareTo(route.price_max()) > 0
                    || routes.putIfAbsent(route.route(), route) != null) {
                throw new IllegalArgumentException("Invalid route");
            }
        }
        if (!routes.keySet().equals(Set.of("MOW-AER", "MOW-LED", "MOW-KGD", "MOW-OVB", "MOW-MRV"))) {
            throw new IllegalArgumentException("Invalid route codes");
        }
        List<String> headers = new ArrayList<>(List.of("route", "date", "seats"));
        for (int i = 1; i <= 9; i++) {
            for (String suffix : List.of("base_demand", "price", "price_demand")) headers.add("0." + i + "_" + suffix);
        }
        var forecastRecords = read(forecastResource, headers);
        if (forecastRecords.size() != 155) throw new IllegalArgumentException("Invalid forecast count");
        for (var record : forecastRecords) {
            String route = record.get(0);
            LocalDate date = LocalDate.parse(record.get(1));
            int seats = Integer.parseInt(record.get(2));
            if (!routes.containsKey(route) || date.isBefore(LocalDate.of(2026, 6, 1))
                    || date.isAfter(LocalDate.of(2026, 7, 1)) || seats <= 0) {
                throw new IllegalArgumentException("Invalid forecast");
            }
            List<BigDecimal> base = new ArrayList<>();
            for (int i = 3; i < 30; i++) {
                var value = new BigDecimal(record.get(i));
                if ((i - 3) % 3 == 0) base.add(value);
            }
            var row = new Row(route, date, seats, List.copyOf(base));
            if (rows.putIfAbsent(route + "|" + date, row) != null) throw new IllegalArgumentException("Duplicate forecast");
        }
    }

    Object catalog() {
        var result = new ArrayList<Map<String, Object>>();
        for (var route : routes.values()) {
            var item = new LinkedHashMap<String, Object>();
            item.put("route", route.route());
            item.put("name", route.name());
            item.put("origin", "Москва");
            item.put("destination", route.name().split(" — ", 2)[1]);
            item.put("base_price", route.base_price());
            item.put("cost_per_passenger", route.cost_per_passenger());
            item.put("price_sensitivity", route.price_sensitivity());
            item.put("price_min", route.price_min());
            item.put("price_max", route.price_max());
            item.put("dates", rows.values().stream().filter(row -> row.route().equals(route.route()))
                    .map(row -> row.date().toString()).sorted().toList());
            result.add(item);
        }
        return Map.of("routes", result);
    }

    Object calculate(String route, String date, BigDecimal price) {
        var routeInfo = routes.get(route);
        if (routeInfo == null) throw new ApiError(400, "INVALID_ROUTE", "Неизвестный маршрут");
        LocalDate parsedDate;
        try {
            parsedDate = LocalDate.parse(date);
        } catch (Exception e) {
            throw new ApiError(400, "INVALID_DATE", "Некорректная дата");
        }
        var row = rows.get(route + "|" + parsedDate);
        if (row == null) throw new ApiError(404, "NOT_FOUND", "Рейс не найден");
        var delta = routeInfo.price_sensitivity().multiply(price.subtract(routeInfo.base_price()));
        var demand = row.base().get(4).subtract(delta);
        var quantiles = new ArrayList<Map<String, Object>>();
        for (int i = 0; i < 9; i++) {
            quantiles.add(Map.of("q", BigDecimal.valueOf(i + 1, 1), "demand", row.base().get(i).subtract(delta)));
        }
        var warnings = new ArrayList<String>();
        if (price.compareTo(routeInfo.price_min()) < 0 || price.compareTo(routeInfo.price_max()) > 0) {
            warnings.add("Цена вне рекомендуемого диапазона");
        }
        return Map.of("route", route, "date", date, "price", price, "seats", row.seats(),
                "base_demand", row.base().get(4), "demand", demand,
                "sales", demand.max(BigDecimal.ZERO).min(BigDecimal.valueOf(row.seats())),
                "quantiles", quantiles, "warnings", warnings);
    }
}
