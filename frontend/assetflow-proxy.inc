# 공통 프록시 설정 (CR-016: 실제 클라이언트 IP 전달)
proxy_pass http://backend:8080;
proxy_set_header Host $host;
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $http_x_forwarded_proto;
proxy_read_timeout 300s;
