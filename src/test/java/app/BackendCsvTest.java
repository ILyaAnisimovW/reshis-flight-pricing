package app;

import static org.junit.jupiter.api.Assertions.*;
import java.nio.charset.StandardCharsets;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;

class BackendCsvTest {
    private static String contents(String name) throws Exception {
        return new String(new ClassPathResource("data/" + name).getInputStream().readAllBytes(), StandardCharsets.UTF_8);
    }
    private static Resource resource(String contents) {
        return new ByteArrayResource(contents.getBytes(StandardCharsets.UTF_8));
    }
    @Test void rejectsInvalidHeadersAndNumbers() throws Exception {
        String routes = contents("routes.csv");
        String forecast = contents("my_forecast.csv");
        assertThrows(Exception.class, () -> new Forecast(resource(routes.replaceFirst("base_price", "wrong")), resource(forecast)));
        assertThrows(Exception.class, () -> new Forecast(resource(routes), resource(forecast.replaceFirst(",734,", ",NaN,"))));
        assertThrows(Exception.class, () -> new Forecast(resource(routes), resource(forecast.replaceFirst(",900,734,", ",0,734,"))));
    }
    @Test void rejectsDuplicateForecastAndMissingRows() throws Exception {
        String routes = contents("routes.csv");
        var lines = new java.util.ArrayList<>(List.of(contents("my_forecast.csv").split("\\R")));
        lines.set(2, lines.get(1));
        assertThrows(Exception.class, () -> new Forecast(resource(routes), resource(String.join("\n", lines))));
        lines.remove(lines.size() - 1);
        assertThrows(Exception.class, () -> new Forecast(resource(routes), resource(String.join("\n", lines))));
    }
}
