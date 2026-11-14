package app;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.core.userdetails.*;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.AuthenticationEntryPoint;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
class Security {
    @Bean
    PasswordEncoder encoder() { return new BCryptPasswordEncoder(); }

    @Bean
    UserDetailsService users(JdbcTemplate db) {
        return username -> {
            var users = db.query("SELECT username,password FROM users WHERE username=?",
                    (rs, n) -> User.withUsername(rs.getString(1)).password(rs.getString(2)).roles("USER").build(), username);
            if (users.isEmpty()) throw new UsernameNotFoundException(username);
            return users.get(0);
        };
    }

    @Bean
    SecurityFilterChain filter(HttpSecurity http, ObjectMapper mapper) throws Exception {
        AuthenticationEntryPoint unauthorized = (request, response, error) -> {
            response.setStatus  (401);
            response.setContentType("application/json;charset=UTF-8");
            mapper.writeValue(response.getWriter(), Map.of("code", "UNAUTHORIZED", "message", "Требуется авторизация"));
        };
        http.requestCache(cache -> cache.disable()).authorizeHttpRequests(auth -> auth.requestMatchers("/api/auth/me", "/api/account/**").authenticated()
                .anyRequest().permitAll())
            .exceptionHandling(errors -> errors.authenticationEntryPoint(unauthorized).accessDeniedHandler((request, response, error) -> {
                response.setStatus(403);
                response.setContentType("application/json;charset=UTF-8");
                mapper.writeValue(response.getWriter(), Map.of("code", "FORBIDDEN", "message", "Доступ запрещён"));
            }))
            .formLogin(form -> form.loginProcessingUrl("/api/auth/login").successHandler((request, response, auth) -> {
                response.setContentType("application/json;charset=UTF-8");
                mapper.writeValue(response.getWriter(), Map.of("username", auth.getName()));
            }).failureHandler((request, response, error) -> unauthorized.commence(request, response, error)))
            .logout(logout -> logout.logoutUrl("/api/auth/logout").logoutSuccessHandler((request, response, auth) -> {
                response.setContentType("application/json;charset=UTF-8");
                mapper.writeValue(response.getWriter(), Map.of("message", "Вы вышли"));
            }));
        return http.build();
    }
}
