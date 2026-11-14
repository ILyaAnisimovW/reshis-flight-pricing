package app;

import com.fasterxml.jackson.databind.JsonNode;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.Authentication;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

class ApiError extends RuntimeException {
    final int status;
    final String code;
    ApiError(int status, String code, String message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

record Registration(@NotBlank @Pattern(regexp = "[A-Za-z0-9_.-]{3,100}") String username,
                    @NotBlank @Size(min = 8) String password) {}

@RestController
class Api {
    private final Forecast forecast;
    private final JdbcTemplate db;
    private final PasswordEncoder encoder;

    Api(Forecast forecast, JdbcTemplate db, PasswordEncoder encoder) {
        this.forecast = forecast;
        this.db = db;
        this.encoder = encoder;
        db.execute("CREATE TABLE IF NOT EXISTS users (username VARCHAR(100) PRIMARY KEY, password VARCHAR(100) NOT NULL)");
    }

    @GetMapping("/api/catalog")
    Object catalog() { return forecast.catalog(); }

    @GetMapping("/api/health")
    Object health() { return Map.of("status", "UP"); }

    @GetMapping("/api/ready")
    Object ready() { return Map.of("status", "UP", "forecast_rows", forecast.rows.size()); }

    @PostMapping("/api/calculate")
    Object calculate(@RequestBody JsonNode body) {
        var route = body.get("route");
        var date = body.get("date");
        var price = body.get("price");
        if (route == null || !route.isTextual() || date == null || !date.isTextual()
                || price == null || !price.isNumber() || price.decimalValue().signum() <= 0) {
            throw new ApiError(400, "INVALID_REQUEST", "Некорректные данные");
        }
        return forecast.calculate(route.asText(), date.asText(), price.decimalValue());
    }

    @GetMapping("/api/auth/csrf")
    Object csrf(CsrfToken token) { return Map.of("token", token.getToken(), "headerName", token.getHeaderName()); }

    @PostMapping("/api/auth/register")
    ResponseEntity<?> register(@Valid @RequestBody Registration body) {
        if (body.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new ApiError(400, "INVALID_REQUEST", "Некорректные данные");
        }
        try {
            db.update("INSERT INTO users(username,password) VALUES (?,?)", body.username(), encoder.encode(body.password()));
        } catch (DuplicateKeyException e) {
            throw new ApiError(409, "DUPLICATE_USER", "Пользователь уже существует");
        }
        return ResponseEntity.status(201).body(Map.of("username", body.username()));
    }

    @GetMapping("/api/auth/me")
    Object me(Authentication auth) { return Map.of("username", auth.getName()); }

    @GetMapping("/api/account/report")
    Object report(Authentication auth) {
        return Map.of("username", auth.getName(), "message", "Используйте расчёт спроса для подготовки решения.");
    }
}

@RestControllerAdvice
class Errors {
    @ExceptionHandler(ApiError.class)
    ResponseEntity<?> api(ApiError e) {
        return ResponseEntity.status(e.status).body(Map.of("code", e.code, "message", e.getMessage()));
    }

    @ExceptionHandler({org.springframework.http.converter.HttpMessageNotReadableException.class,
                       org.springframework.web.bind.MethodArgumentNotValidException.class})
    ResponseEntity<?> bad(Exception e) {
        return ResponseEntity.badRequest().body(Map.of("code", "INVALID_REQUEST", "message", "Некорректные данные"));
    }

    @ExceptionHandler(Exception.class)
    ResponseEntity<?> other(Exception e) {
        return ResponseEntity.internalServerError().body(Map.of("code", "INTERNAL_ERROR", "message", "Внутренняя ошибка"));
    }
}
