package app;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.mock.web.MockHttpSession;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
@SpringBootTest @AutoConfigureMockMvc @TestPropertySource(properties="spring.datasource.url=jdbc:h2:mem:qa;DB_CLOSE_DELAY=-1")
class QaAuthTest {
 @Autowired MockMvc mvc;
 @Test void registrationLoginProtectedAndLogout() throws Exception {
  String user="qa"+java.util.UUID.randomUUID().toString().replace("-", "");
  String json="{\"username\":\""+user+"\",\"password\":\"Password123!\"}";
  mvc.perform(post("/api/auth/register").contentType("application/json").content(json)).andExpect(status().isForbidden());
  mvc.perform(post("/api/auth/register").with(csrf()).contentType("application/json").content(json)).andExpect(status().isCreated());
  mvc.perform(post("/api/auth/register").with(csrf()).contentType("application/json").content(json)).andExpect(status().isConflict());
  mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
  mvc.perform(post("/api/auth/login").with(csrf()).param("username",user).param("password","wrong")).andExpect(status().isUnauthorized());
  var login=mvc.perform(post("/api/auth/login").with(csrf()).param("username",user).param("password","Password123!")).andExpect(status().isOk()).andReturn();
  var session=(MockHttpSession)login.getRequest().getSession(false);
  mvc.perform(get("/api/account/report").session(session)).andExpect(status().isOk()).andExpect(jsonPath("$.username").value(user));
  mvc.perform(post("/api/auth/logout").session(session)).andExpect(status().isForbidden());
  mvc.perform(post("/api/auth/logout").session(session).with(csrf())).andExpect(status().isOk());
  mvc.perform(get("/api/account/report").session(session)).andExpect(status().isUnauthorized());
 }
}
