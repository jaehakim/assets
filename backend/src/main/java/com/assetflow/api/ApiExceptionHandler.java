package com.assetflow.api;

import jakarta.validation.ConstraintViolationException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import java.util.Map;

/** CR-S07 ④ · CR-S10: 검증·제약 위반을 500 대신 4xx + 공통 오류 본문으로 변환한다(스택·SQL 미노출). */
@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<Map<String, String>> invalid(MethodArgumentNotValidException e) {
    var first = e.getBindingResult().getFieldErrors().stream().findFirst();
    return ResponseEntity.unprocessableEntity().body(Map.of("error", first.map(f -> f.getField() + ": " + f.getDefaultMessage()).orElse("validation failed")));
  }

  @ExceptionHandler(ConstraintViolationException.class)
  public ResponseEntity<Map<String, String>> constraint(ConstraintViolationException e) {
    return ResponseEntity.unprocessableEntity().body(Map.of("error", "validation failed"));
  }

  @ExceptionHandler(DataIntegrityViolationException.class)
  public ResponseEntity<Map<String, String>> integrity(DataIntegrityViolationException e) {
    return ResponseEntity.unprocessableEntity().body(Map.of("error", "value exceeds the allowed length or violates a database constraint"));
  }

  @ExceptionHandler(MaxUploadSizeExceededException.class)
  public ResponseEntity<Map<String, String>> tooLarge(MaxUploadSizeExceededException e) {
    return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(Map.of("error", "upload exceeds the allowed size"));
  }
}
