package app;

import static org.junit.jupiter.api.Assertions.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class BackendForecastTest {
    @Test
    void loadsCompleteGridAndComputesDemandAtBasePrice() throws Exception {
        var forecast = new Forecast();
        assertEquals(5, forecast.routes.size());
        assertEquals(155, forecast.rows.size());

        var result = (Map<?, ?>) forecast.calculate("MOW-AER", "2026-06-01", new BigDecimal("9000"));
        var demand = (BigDecimal) result.get("demand");
        // At the base price, demand equals the median base demand (854), not price_demand (766).
        assertEquals(0, new BigDecimal("854").compareTo(demand));
        assertNotEquals(0, new BigDecimal("766").compareTo(demand));
        assertEquals(9, ((List<?>) result.get("quantiles")).size());
    }

    @Test
    void clampsSalesAndReportsMissingFlights() throws Exception {
        var forecast = new Forecast();
        var result = (Map<?, ?>) forecast.calculate("MOW-AER", "2026-06-01", new BigDecimal("100000"));
        assertEquals(0, BigDecimal.ZERO.compareTo((BigDecimal) result.get("sales")));
        assertFalse(((List<?>) result.get("warnings")).isEmpty());
        assertEquals(404, assertThrows(ApiError.class,
                () -> forecast.calculate("MOW-AER", "2026-07-02", BigDecimal.ONE)).status);
    }
}
