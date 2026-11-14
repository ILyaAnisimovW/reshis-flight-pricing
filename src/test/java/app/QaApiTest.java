package app;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.junit.jupiter.api.Assertions.*;
import java.util.List;
@SpringBootTest @AutoConfigureMockMvc @TestPropertySource(properties="spring.datasource.url=jdbc:h2:mem:qa;DB_CLOSE_DELAY=-1")
class QaApiTest {
 @Autowired MockMvc mvc;
 @Test void realCsvFormulaAndBounds() throws Exception {
  mvc.perform(post("/api/calculate").with(csrf()).contentType("application/json").content("{\"route\":\"MOW-AER\",\"date\":\"2026-06-01\",\"price\":10000}"))
   .andExpect(status().isOk()).andExpect(jsonPath("$.base_demand").value(854)).andExpect(jsonPath("$.demand").value(713)).andExpect(jsonPath("$.sales").value(713)).andExpect(jsonPath("$.quantiles[0].demand").value(593)).andExpect(jsonPath("$.quantiles[8].demand").value(834));
  mvc.perform(post("/api/calculate").with(csrf()).contentType("application/json").content("{\"route\":\"MOW-AER\",\"date\":\"2026-06-01\",\"price\":1}")).andExpect(jsonPath("$.sales").value(900)).andExpect(jsonPath("$.warnings[0]").exists());
  mvc.perform(post("/api/calculate").with(csrf()).contentType("application/json").content("{\"route\":\"MOW-AER\",\"date\":\"2026-06-01\",\"price\":100000}")).andExpect(jsonPath("$.sales").value(0));
 }
 @Test void rejectsInvalidInputsAndProtectsResources() throws Exception {
  for(String p:List.of("true","\"9000\"","null","NaN","Infinity","-1","0")) mvc.perform(post("/api/calculate").with(csrf()).contentType("application/json").content("{\"route\":\"MOW-AER\",\"date\":\"2026-06-01\",\"price\":"+p+"}")).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").exists());
  for(String body:List.of("{}","{\"route\":\"UNKNOWN\",\"date\":\"2026-06-01\",\"price\":1}","{\"route\":\"MOW-AER\",\"date\":\"2026-02-30\",\"price\":1}")) mvc.perform(post("/api/calculate").with(csrf()).contentType("application/json").content(body)).andExpect(status().isBadRequest());
  mvc.perform(post("/api/calculate").contentType("application/json").content("{}")).andExpect(status().isForbidden());
  mvc.perform(get("/api/account/report")).andExpect(status().isUnauthorized());
 }
 @Test void csvReaderRejectsWrongSchemaAndMissingFile() { assertThrows(Exception.class,()->Forecast.read(new org.springframework.core.io.ClassPathResource("data/routes.csv"),List.of("route"))); assertThrows(Exception.class,()->Forecast.read(new org.springframework.core.io.ClassPathResource("data/absent.csv"),List.of("route"))); assertThrows(Exception.class,()->Forecast.read(new org.springframework.core.io.ClassPathResource("qa/corrupt.csv"),List.of("a","b"))); }
}
