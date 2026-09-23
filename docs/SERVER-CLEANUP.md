# 서버 정리 — 언제한번 제거

> **이 문서는 kotlin-lab 배포의 선행 작업이다.** 지금 서버의 Caddy 가 언제한번 스택에
> 들어 있어서, 그대로 두면 학습 사이트의 프록시가 남의 스택에 얹히게 된다.

## ⚠️ 먼저 알아야 할 것

### 1. Caddy 가 언제한번 스택 안에 있다

`meetsometime-ops/apply/docker-compose.prod.yml` 에서:

```yaml
caddy:
    image: caddy:2-alpine
    container_name: meetsometime-caddy
    ports: ["80:80", "443:443"]
```

**`docker compose down` 하면 서버의 모든 HTTPS 가 같이 죽는다.** 80/443 을 이 컨테이너가 쥐고 있다.
그래서 **Caddy 를 먼저 독립시킨 다음** 언제한번을 내린다.

### 2. 볼륨에 마지막 사본이 남아 있을 수 있다

`docs/postmortem-2026-06-19-empty-db-volume.md` 기록:

> 원본 볼륨 `meetsometime_ms-db-data`(약 66MB, V22·V23 반영본)는 **마운트만 해제된 채 그대로 존재**

compose 파일이 두 벌 공존하면서 볼륨 이름이 갈린 이력이 있다.
**`docker compose down -v` 나 `docker volume prune` 를 먼저 치지 않는다.** 실데이터가 거기 있을 수 있다.

---

## 순서

### 0. 현황 파악 (읽기만, 아무것도 바꾸지 않음)

```bash
docker ps -a --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
docker volume ls | grep -i meetsometime
docker compose ls            # 떠 있는 스택과 compose 파일 경로
ls -la ~/backups/ 2>/dev/null
```

볼륨 목록을 **그대로 적어둔다.** 다음 단계의 기준이 된다.

### 1. 백업 — 지우기 전에 반드시

DB 컨테이너가 살아 있으면 논리 백업이 가장 확실하다:

```bash
docker exec meetsometime-db pg_dumpall -U postgres | gzip > ~/backups/meetsometime-final-$(date +%Y%m%d-%H%M).sql.gz
ls -lh ~/backups/
```

컨테이너가 죽어 있다면 **볼륨을 통째로 tar 로** 뜬다 (마운트 해제된 고아 볼륨 포함):

```bash
for v in $(docker volume ls -q | grep -i meetsometime); do
  echo "== $v"
  docker run --rm -v "$v":/src -v ~/backups:/dst alpine \
    tar czf "/dst/vol-$v-$(date +%Y%m%d).tar.gz" -C /src .
done
ls -lh ~/backups/
```

> 여기서 **크기가 0 이거나 수 KB 인 볼륨은 빈 것**이고, 수십 MB 짜리가 실데이터다.
> 포스트모템의 `ms-db-data`(66MB)가 그 예다. 크기를 보고 무엇이 진짜인지 판단한다.

백업 파일을 **서버 밖으로도** 한 벌 내린다:

```bash
# 로컬 맥에서
scp <서버>:~/backups/meetsometime-final-*.sql.gz ~/Desktop/
```

### 2. Caddy 독립시키기

언제한번과 무관한 자체 스택으로 옮긴다. 프록시는 앞으로도 계속 쓴다.

```bash
sudo mkdir -p /srv/proxy && cd /srv/proxy
```

`/srv/proxy/docker-compose.yml`:

```yaml
services:
  caddy:
    image: caddy:2-alpine
    container_name: proxy-caddy
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data          # 인증서. 지우면 Let's Encrypt 재발급 → 레이트리밋 주의
      - caddy-config:/config
      - /srv/kotlin-lab/site:/srv/kotlin-lab/site:ro
      - /srv/study:/srv/study:ro
    logging:
      driver: json-file
      options: { max-size: 10m, max-file: "3" }

volumes:
  caddy-data:
  caddy-config:
```

`/srv/proxy/Caddyfile` — 기존 `security_headers` 스니펫 + `kotlin-lab/deploy/Caddyfile.snippet` 의 `cairn.today` 블록.
**언제한번 사이트 블록(meetsometime.com 등)은 옮기지 않는다.** 내릴 대상이다.

> **인증서를 살리려면** 기존 caddy-data 볼륨의 내용을 새 볼륨으로 옮긴다.
> 안 그러면 새로 발급받는데, Let's Encrypt 는 같은 도메인에 주당 발급 횟수 제한이 있다.
> ```bash
> docker run --rm -v meetsometime_caddy-data:/from -v proxy_caddy-data:/to alpine \
>   sh -c 'cd /from && cp -a . /to'
> ```

### 3. 전환 — 짧은 다운타임

```bash
# 기존 Caddy 만 정지 (앱·DB 는 아직 건드리지 않는다)
cd <언제한번 compose 디렉터리>
docker compose stop caddy

# 새 프록시 기동
cd /srv/proxy
docker compose config          # 문법 확인
docker compose up -d
docker compose logs -f caddy   # 인증서 발급/로드 확인
```

확인:

```bash
curl -sI https://cairn.today/ | head -1            # 401 (basic_auth)
curl -sI https://mentorlog.cairn.today/ | head -1  # 더 이상 블록이 없으면 404/리다이렉트
```

### 4. 언제한번 내리기

여기까지 왔으면 프록시는 독립했다.

```bash
cd <언제한번 compose 디렉터리>
docker compose down            # -v 를 붙이지 않는다. 볼륨은 남긴다
docker ps -a | grep meetsometime   # 남은 컨테이너 확인
```

컨테이너만 지우고 **볼륨은 최소 2주 남겨둔다.** 백업이 실제로 복원되는지 확인한 뒤에 지운다.

```bash
# 2주 뒤, 백업 검증이 끝난 다음에만
docker volume ls | grep -i meetsometime      # 지울 목록 재확인
# docker volume rm <이름>                     # 하나씩. prune 로 한 번에 지우지 않는다
```

### 5. DNS 정리 (가비아)

```
meetsometime.com        A  →  삭제
www.meetsometime.com    A  →  삭제
api.meetsometime.com    A  →  삭제
mentorlog.cairn.today   A  →  삭제
cairn.today             A  →  3.35.203.67   (추가)
```

### 6. 정리 확인

```bash
docker ps --format 'table {{.Names}}\t{{.Status}}'
docker system df                     # 회수된 공간
free -m                              # 메모리 여유 (4GB 중)
```

---

## 되돌리기

전환 중 문제가 생기면:

```bash
cd /srv/proxy && docker compose down
cd <언제한번 compose 디렉터리> && docker compose start caddy
```

4단계(`docker compose down`)까지 갔더라도 **볼륨을 안 지웠으면** 원래 compose 로 `up -d` 하면 돌아온다.
그게 볼륨을 2주 남겨두는 이유다.

---

## 하지 말 것

- `docker compose down -v` — 볼륨까지 지운다. 포스트모템의 고아 볼륨이 날아간다
- `docker volume prune` — 마운트 안 된 볼륨을 전부 지운다. **`ms-db-data` 가 정확히 그 상태다**
- `docker system prune -a --volumes` — 위 둘을 합친 것
- 백업 없이 3단계 이후로 진행
