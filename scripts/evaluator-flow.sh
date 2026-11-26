#!/usr/bin/env bash
# Evaluator flow (TASK.md, "Fluxo do avaliador") driven by curl against the RUNNING stack.
# Reproduces the steps observable through HTTP (steps 17-18 are manual and print SKIP).
#   usage: [APP_PORT=8080] [PARTNER_API_KEY=...] [FAST=1] scripts/evaluator-flow.sh
#   FAST=1: in step 8, poll until T2 is declined instead of waiting the full 45 s.
# Bash 3.2 compatible (macOS): no associative arrays, no mapfile, no ${var,,}.
set -euo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"

API="${API:-http://localhost:${APP_PORT}}"
WEB="${WEB:-$API}"
KEY="${PARTNER_API_KEY:-catraca-partner-key-dev}"
FAST="${FAST:-0}"
ORG_A_EMAIL="organizador.a@catraca.local"
ORG_B_EMAIL="organizador.b@catraca.local"
SEED_P_EMAIL="participante@catraca.local"
SEED_PASSWORD="catraca123"

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/catraca-flow.XXXXXX")"
# shellcheck disable=SC2329 # invoked by the EXIT trap
cleanup() { rm -rf "$WORK_DIR"; }
trap cleanup EXIT

PASSED=0
FAILED=0
SKIPPED=0

pass() {
  PASSED=$((PASSED + 1))
  printf '%s[PASS]%s FLOW-%s %s\n' "$C_GRN" "$C_RST" "$1" "$2"
}

# fail NN "what" "details": standard [ERRO][FLOW-NN] message; the flow continues.
fail() {
  FAILED=$((FAILED + 1))
  err "FLOW-$1" "$2" "O produto divergiu do passo $((10#$1)) do Fluxo do avaliador (TASK.md)." \
    "Compare com o passo no TASK.md e veja os logs: make logs SERVICE=app" "${3:-}"
}

skip() {
  SKIPPED=$((SKIPPED + 1))
  printf '%s[SKIP]%s FLOW-%s %s\n' "$C_YLW" "$C_RST" "$1" "$2"
}

# check NN "description" CONDITION_EXIT_CODE "details"
check() {
  if [ "$3" -eq 0 ]; then pass "$1" "$2"; else fail "$1" "$2" "${4:-}"; fi
}

# --- HTTP helpers -------------------------------------------------------------------------------

STATUS=""
BODY=""

# api METHOD PATH [JSON_BODY] [KEY|-]: partner API call; "-" as key omits the header.
api() {
  local method="$1" path="$2" data="${3:-}" key="${4:-$KEY}"
  local args=(-s -o "$WORK_DIR/body" -w '%{http_code}' -X "$method")
  if [ "$key" != "-" ]; then args+=(-H "X-Api-Key: $key"); fi
  if [ -n "$data" ]; then args+=(-H "Content-Type: application/json" --data-raw "$data"); fi
  STATUS="$(curl "${args[@]}" "$API$path" || true)"
  [ -n "$STATUS" ] || STATUS="000"
  BODY="$(cat "$WORK_DIR/body" 2>/dev/null || true)"
}

# jget JSON 'JS expression over d' → prints the result ('' for undefined/null, JSON for objects).
jget() {
  node_run -e '
    let d; try { d = JSON.parse(process.argv[1]); } catch { process.exit(0); }
    let v; try { v = eval(process.argv[2]); } catch { v = undefined; }
    if (v === undefined || v === null) process.exit(0);
    console.log(typeof v === "object" ? JSON.stringify(v) : String(v));
  ' "$1" "$2"
}

# event_field EVENT_ID FIELD: field of the event in the API listing ('' when not listed).
# Runs in a command substitution (subshell): STATUS/BODY are not visible to the caller.
event_field() {
  api GET /api/partner/events
  jget "$BODY" "(d.find((e) => e.id === '$1') || {}).$2"
}

ticket_status() {
  api GET "/api/partner/tickets/$1"
  jget "$BODY" "d.status"
}

# web_login JAR EMAIL: organizer login through the web UI (cookie jar).
web_login() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -c "$1" -b "$1" -X POST "$WEB/login" \
    --data-urlencode "email=$2" --data-urlencode "password=$SEED_PASSWORD")"
  [ "$code" = "303" ]
}

# create_event JAR NAME CAPACITY PRICE → prints the new event id (draft) or nothing.
create_event() {
  local starts
  : >"$WORK_DIR/headers"
  starts="$(node_run -e 'const d=new Date(Date.now()+30*864e5-3*36e5);console.log(d.toISOString().slice(0,10)+"T21:00")')"
  curl -s -o /dev/null -D "$WORK_DIR/headers" -c "$1" -b "$1" -X POST "$WEB/organizer/events" \
    --data-urlencode "name=$2" --data-urlencode "startsAt=$starts" \
    --data-urlencode "venue=Porão do Fluxo" --data-urlencode "capacity=$3" \
    --data-urlencode "price=$4" >/dev/null || true
  tr -d '\r' <"$WORK_DIR/headers" | sed -n 's#^[Ll]ocation: */organizer/events/\(evt_[A-Za-z0-9_]*\).*#\1#p' | head -n1
}

publish_event() {
  local code
  code="$(curl -s -o /dev/null -w '%{http_code}' -c "$1" -b "$1" -X POST \
    "$WEB/organizer/events/$2/publish")"
  [ "$code" = "303" ]
}

# web_get JAR PATH → STATUS/BODY of a web page (cookie jar).
web_get() {
  STATUS="$(curl -s -o "$WORK_DIR/page" -w '%{http_code}' -c "$1" -b "$1" "$WEB$2" || true)"
  BODY="$(cat "$WORK_DIR/page" 2>/dev/null || true)"
}

# testid HTML ID → text of the first element with data-testid="ID" (tags stripped).
testid() {
  printf '%s' "$1" | tr '\n' ' ' | sed -n "s#.*data-testid=\"$2\"[^>]*>\([^<]*\)<.*#\1#p" | head -n1 |
    sed 's/^ *//; s/ *$//'
}

# checkin JAR EVENT_ID CODE: check-in POST on the management page → STATUS/BODY, and the
# message (text of data-testid="checkin-result") in CHECKIN.
CHECKIN=""
checkin() {
  STATUS="$(curl -s -o "$WORK_DIR/page" -w '%{http_code}' -c "$1" -b "$1" -X POST \
    "$WEB/organizer/events/$2/checkin" --data-urlencode "code=$3" || true)"
  BODY="$(cat "$WORK_DIR/page" 2>/dev/null || true)"
  CHECKIN="$(testid "$BODY" checkin-result)"
}

# dash JAR EVENT_ID: reads the dashboard of the management page into DASH as
# "Confirmados/Pendentes/Check-ins/Vagas/Receita/Estornados" (e.g. "3/0/0/0/R$ 350,00/0").
DASH=""
dash() {
  local id out=""
  web_get "$1" "/organizer/events/$2"
  for id in confirmed pending checkins available revenue refunded; do
    out="$out/$(testid "$BODY" "dash-$id")"
  done
  DASH="${out#/}"
}

# wait_dash JAR EVENT_ID EXPECTED SECONDS: polls the dashboard until DASH = EXPECTED (or timeout).
wait_dash() {
  local start=$SECONDS
  dash "$1" "$2"
  while [ "$DASH" != "$3" ] && [ $((SECONDS - start)) -lt "$4" ]; do
    sleep 0.5
    dash "$1" "$2"
  done
  [ "$DASH" = "$3" ]
}

# edit_event JAR EVENT_ID NAME CAPACITY PRICE → HTTP status of the edit POST (keeps the start date
# and venue read from the edit form of the management page).
edit_event() {
  local starts venue
  web_get "$1" "/organizer/events/$2"
  starts="$(printf '%s' "$BODY" | tr '\n' ' ' | sed -n 's#.*name="startsAt"[^>]*value="\([^"]*\)".*#\1#p')"
  venue="$(printf '%s' "$BODY" | tr '\n' ' ' | sed -n 's#.*name="venue"[^>]*value="\([^"]*\)".*#\1#p')"
  curl -s -o /dev/null -w '%{http_code}' -c "$1" -b "$1" -X POST "$WEB/organizer/events/$2" \
    --data-urlencode "name=$3" --data-urlencode "startsAt=$starts" \
    --data-urlencode "venue=$venue" --data-urlencode "capacity=$4" \
    --data-urlencode "price=$5" || true
}

# shows_event_data HTML: true when the page exposes E1 data (its name or the code C1).
shows_event_data() {
  printf '%s' "$1" | grep -Fq -e "$E1_NAME" -e "$C1"
}

purchase_json() {
  printf '{"buyerEmail":"%s","cardNumber":"%s"}' "$1" "$2"
}

# --- Preconditions ------------------------------------------------------------------------------

curl -sf "$API/healthz" >/dev/null 2>&1 ||
  die "FLOW-001" "O produto não responde em $API" "O ambiente não está no ar ou usa outra porta." \
    "Suba com make up (ou ajuste APP_PORT) e rode de novo: make evaluator-flow" "curl -v $API/healthz"

info "Fluxo do avaliador contra $API (FAST=$FAST)"
RUN_ID="$(date +%s)"
JAR_A="$WORK_DIR/org-a.jar"
JAR_B="$WORK_DIR/org-b.jar"
web_login "$JAR_A" "$ORG_A_EMAIL" ||
  die "FLOW-002" "Login do organizador A falhou" "Seed não aplicada ou credenciais alteradas." \
    "Rode make down && make up para reaplicar a seed." "curl -i -X POST $WEB/login"

# --- Step 1 -------------------------------------------------------------------------------------
pass "01" "produto no ar com a seed (login do organizador A)"

# --- Step 2: draft E1 is not listed ------------------------------------------------------------
E1_NAME="E1 Fluxo $RUN_ID"
E1="$(create_event "$JAR_A" "$E1_NAME" 2 "100,00")"
if [ -z "$E1" ]; then
  die "FLOW-02" "Não foi possível criar o evento E1 pela área do organizador" \
    "Formulário de criação rejeitou os dados ou a sessão expirou." \
    "Crie manualmente em $WEB/organizer/events/new e veja make logs SERVICE=app"
fi
api GET /api/partner/events
listed="$(jget "$BODY" "d.some((e) => e.id === '$E1') ? 'yes' : 'no'")"
rc=0; [ "$STATUS" = "200" ] && [ "$listed" = "no" ] || rc=1
check "02" "E1 em rascunho ($E1) não aparece na listagem da API" "$rc" "HTTP $STATUS; listado=$listed"
web_get "$WORK_DIR/visitor.jar" /
rc=0; [ "$STATUS" = "200" ] && ! printf '%s' "$BODY" | grep -q "data-event-id=\"$E1\"" || rc=1
check "02" "vitrine deslogada não mostra E1" "$rc" "GET / → HTTP $STATUS"

# --- Step 3 -------------------------------------------------------------------------------------
skip "03" "criação com data de ontem é rejeitada (coberto pelos testes da F02; fora do escopo da API)"

# --- Step 4: publish E1 ------------------------------------------------------------------------
publish_event "$JAR_A" "$E1" || fail "04" "Publicação de E1 falhou" "POST /organizer/events/$E1/publish"
api GET /api/partner/events
seats="$(jget "$BODY" "(d.find((e) => e.id === '$E1') || {}).availableSeats")"
price="$(jget "$BODY" "(d.find((e) => e.id === '$E1') || {}).priceCents")"
starts="$(jget "$BODY" "(d.find((e) => e.id === '$E1') || {}).startsAt")"
rc=0; [ "$seats" = "2" ] && [ "$price" = "10000" ] && printf '%s' "$starts" | grep -Eq -- '-03:00$' || rc=1
check "04" "E1 publicado aparece na API com availableSeats 2, priceCents 10000 e startsAt $starts" "$rc" \
  "availableSeats=$seats priceCents=$price startsAt=$starts"
web_get "$WORK_DIR/visitor.jar" /
rc=0; printf '%s' "$BODY" | grep -q "data-event-id=\"$E1\"" || rc=1
check "04" "E1 publicado aparece na vitrine" "$rc" "GET / sem data-event-id=$E1"

# --- Step 5: new participant buys E1 on the showcase -------------------------------------------
JAR_P="$WORK_DIR/participant.jar"
P_EMAIL="participante-$RUN_ID@example.com"
code="$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR_P" -b "$JAR_P" -X POST "$WEB/signup" \
  --data-urlencode "name=Participante Fluxo" --data-urlencode "email=$P_EMAIL" \
  --data-urlencode "password=segredo123")"
[ "$code" = "303" ] || fail "05" "Cadastro de participante falhou" "POST /signup → HTTP $code"
code="$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR_P" -b "$JAR_P" -X POST \
  "$WEB/events/$E1/purchase" --data-urlencode "cardNumber=4000000000000001")"
p5_at=$SECONDS
web_get "$JAR_P" /me/tickets
first="$(testid "$BODY" ticket-status)"
C1="$(testid "$BODY" ticket-code)"
rc=0; [ "$code" = "303" ] && [ "$first" = "pendente" ] && [ -n "$C1" ] || rc=1
check "05" "compra na vitrine → 'Meus ingressos' mostra pendente (código C1=$C1)" "$rc" \
  "POST purchase → $code; status='$first'"
st="$first"
while [ $((SECONDS - p5_at)) -le 6 ] && [ "$st" != "confirmado" ]; do
  sleep 0.5
  web_get "$JAR_P" /me/tickets
  st="$(testid "$BODY" ticket-status)"
done
rc=0; [ "$st" = "confirmado" ] || rc=1
check "05" "ingresso C1 confirmado em $((SECONDS - p5_at))s (recarregando a página)" "$rc" "status='$st'"

# --- Step 6: API purchase with the slow-decline card -------------------------------------------
STEP6_AT=$SECONDS
api POST "/api/partner/events/$E1/purchases" "$(purchase_json t2@example.com 4000000000000004)"
T2="$(jget "$BODY" "d.ticketId")"
C2="$(jget "$BODY" "d.code")"
st="$(jget "$BODY" "d.status")"
keys="$(jget "$BODY" "Object.keys(d).sort().join(',')")"
rc=0; [ "$STATUS" = "202" ] && [ "$st" = "pending" ] && [ "$keys" = "code,status,ticketId" ] || rc=1
check "06" "compra pela API (…0004) → 202 pending ($T2, código C2=$C2)" "$rc" "HTTP $STATUS $BODY"
seats="$(event_field "$E1" availableSeats)"
rc=0; [ "$seats" = "0" ] || rc=1
check "06" "listagem mostra E1 com availableSeats 0" "$rc" "availableSeats=$seats"

# --- Step 7: sold out before 30 s --------------------------------------------------------------
api POST "/api/partner/events/$E1/purchases" "$(purchase_json t-sold@example.com 4000000000000001)"
elapsed=$((SECONDS - STEP6_AT))
rc=0; [ "$STATUS" = "409" ] && [ "$BODY" = '{"error":"sold_out"}' ] && [ "$elapsed" -lt 30 ] || rc=1
check "07" "nova compra antes de 30 s (${elapsed}s) → 409 sold_out" "$rc" "HTTP $STATUS $BODY"
web_get "$JAR_P" "/events/$E1"
rc=0; [ "$(testid "$BODY" sold-out)" = "Ingressos esgotados" ] || rc=1
check "07" "vitrine exibe 'Ingressos esgotados' para o participante do passo 5" "$rc" "GET /events/$E1"

# --- Step 8: after 45 s T2 is declined and the seat is back -------------------------------------
if [ "$FAST" = "1" ]; then
  info "FAST=1: aguardando T2 sair de pending (até 45 s após o passo 6)"
  while [ $((SECONDS - STEP6_AT)) -lt 45 ] && [ "$(ticket_status "$T2")" = "pending" ]; do sleep 1; done
else
  info "Aguardando 45 s desde o passo 6 (use FAST=1 para só esperar a decisão do gateway)"
  while [ $((SECONDS - STEP6_AT)) -lt 45 ]; do sleep 1; done
fi
api GET "/api/partner/tickets/$T2"
st="$(jget "$BODY" "d.status")"
keys="$(jget "$BODY" "Object.keys(d).sort().join(',')")"
checked="$(jget "$BODY" "String(d.checkedIn)")"
rc=0; [ "$st" = "declined" ] && [ "$keys" = "checkedIn,code,eventId,status,ticketId" ] && [ "$checked" = "false" ] || rc=1
check "08" "T2 está declined após $((SECONDS - STEP6_AT))s" "$rc" "GET /api/partner/tickets/$T2 → $BODY"
seats="$(event_field "$E1" availableSeats)"
rc=0; [ "$seats" = "1" ] || rc=1
check "08" "E1 volta a ter availableSeats 1" "$rc" "availableSeats=$seats"
api POST "/api/partner/events/$E1/purchases" "$(purchase_json t3@example.com 4000000000000001)"
T3="$(jget "$BODY" "d.ticketId")"
t3_at=$SECONDS
st=""
if [ "$STATUS" = "202" ]; then
  # Brief: confirmed within 5 s (1 s of tolerance for the polling itself).
  while [ $((SECONDS - t3_at)) -le 6 ]; do
    st="$(ticket_status "$T3")"
    [ "$st" = "confirmed" ] && break
    sleep 0.5
  done
fi
rc=0; [ "$st" = "confirmed" ] || rc=1
check "08" "T3 ($T3, …0001) confirmado em $((SECONDS - t3_at))s" "$rc" "status=$st"

# --- Step 9: capacity/price edit, T4 at the new price, dashboard of E1 -------------------------
code="$(edit_event "$JAR_A" "$E1" "$E1_NAME" 1 "100,00")"
rc=0; [ "$code" = "422" ] || rc=1
check "09" "reduzir a lotação de E1 para 1 é rejeitado (HTTP $code)" "$rc" "esperado: 422"
code="$(edit_event "$JAR_A" "$E1" "$E1_NAME" 3 "150,00")"
rc=0; [ "$code" = "303" ] || rc=1
check "09" "preço R\$ 150,00 e lotação 3 em E1 são aceitos (HTTP $code)" "$rc" "esperado: 303"
api POST "/api/partner/events/$E1/purchases" "$(purchase_json "t4-$RUN_ID@example.com" 4000000000000001)"
T4="$(jget "$BODY" "d.ticketId")"
t4_at=$SECONDS
st=""
if [ "$STATUS" = "202" ]; then
  while [ $((SECONDS - t4_at)) -le 6 ]; do
    st="$(ticket_status "$T4")"
    [ "$st" = "confirmed" ] && break
    sleep 0.5
  done
fi
rc=0; [ "$st" = "confirmed" ] || rc=1
check "09" "T4 ($T4, …0001) confirmado em $((SECONDS - t4_at))s" "$rc" "status=$st"
expected="3/0/0/0/R\$ 350,00/0"
rc=0; wait_dash "$JAR_A" "$E1" "$expected" 5 || rc=1
check "09" "painel de E1 (Confirmados/Pendentes/Check-ins/Vagas/Receita/Estornados) = $DASH" "$rc" \
  "esperado: $expected"

# --- Step 10: check-in on E1 as organizer A ----------------------------------------------------
E1_URL="/organizer/events/$E1"
for pair in "$C1|Entrada liberada|C1" "$C1|Ingresso já utilizado|C1 de novo" \
  "$C2|Ingresso não confirmado|C2" "ZZZZZZZZ|Ingresso inválido para este evento|ZZZZZZZZ"; do
  code_in="${pair%%|*}"
  rest="${pair#*|}"
  expected="${rest%%|*}"
  label="${rest#*|}"
  checkin "$JAR_A" "$E1" "$code_in"
  rc=0; [ "$STATUS" = "200" ] && [ "$CHECKIN" = "$expected" ] || rc=1
  check "10" "check-in de $label ($code_in) em E1 → '$expected'" "$rc" "HTTP $STATUS; checkin-result='$CHECKIN'"
done
dash "$JAR_A" "$E1"
expected="3/0/1/0/R\$ 350,00/0"
rc=0; [ "$DASH" = "$expected" ] || rc=1
check "10" "painel de E1 mostra Check-ins 1 ($DASH)" "$rc" "esperado: $expected"
web_get "$JAR_A" "$E1_URL"
rc=0; [ "$STATUS" = "200" ] && printf '%s' "$BODY" | grep -Fq "$E1_NAME" || rc=1
check "10" "endereço da página de gestão de E1 copiado: $E1_URL" "$rc" "GET $E1_URL → HTTP $STATUS"

# --- Step 11: isolation between organizers; C3 (E2) is invalid on E1 --------------------------
C3=""
if web_login "$JAR_B" "$ORG_B_EMAIL"; then
  web_get "$JAR_B" /organizer/events
  rc=0; [ "$STATUS" = "200" ] && ! printf '%s' "$BODY" | grep -Fq "$E1_NAME" || rc=1
  check "11" "organizador B: lista de eventos não mostra E1" "$rc" "GET /organizer/events → HTTP $STATUS"
  web_get "$JAR_B" "$E1_URL"
  rc=0; ! shows_event_data "$BODY" || rc=1
  check "11" "organizador B: endereço de E1 não exibe dados de E1 (HTTP $STATUS)" "$rc" "GET $E1_URL"
  E2="$(create_event "$JAR_B" "E2 Fluxo $RUN_ID" 1 "20,00")"
  if [ -n "$E2" ] && publish_event "$JAR_B" "$E2"; then
    price="$(event_field "$E2" priceCents)"
    api POST "/api/partner/events/$E2/purchases" "$(purchase_json "c3-$RUN_ID@example.com" 4000000000000001)"
    C3="$(jget "$BODY" "d.code")"
    rc=0; [ "$price" = "2000" ] && [ "$STATUS" = "202" ] && [ -n "$C3" ] || rc=1
    check "11" "E2 do organizador B listado (priceCents 2000) e comprado pela API (C3=$C3)" "$rc" \
      "priceCents=$price; compra HTTP $STATUS $BODY"
  else
    fail "11" "Não foi possível criar/publicar E2 como organizador B" "E2='$E2'"
  fi
else
  fail "11" "Login do organizador B falhou" "curl -i -X POST $WEB/login"
fi
JAR_SEED_P="$WORK_DIR/seed-participant.jar"
if web_login "$JAR_SEED_P" "$SEED_P_EMAIL"; then
  web_get "$JAR_SEED_P" "$E1_URL"
  rc=0; ! shows_event_data "$BODY" || rc=1
  check "11" "participante da seed: endereço de E1 não exibe dados de E1 (HTTP $STATUS)" "$rc" "GET $E1_URL"
else
  fail "11" "Login do participante da seed falhou" "curl -i -X POST $WEB/login"
fi
web_get "$WORK_DIR/visitor-11.jar" "$E1_URL"
rc=0; ! shows_event_data "$BODY" || rc=1
check "11" "deslogado: endereço de E1 não exibe dados de E1 (HTTP $STATUS)" "$rc" "GET $E1_URL"
if [ -n "$C3" ]; then
  checkin "$JAR_A" "$E1" "$C3"
  rc=0; [ "$STATUS" = "200" ] && [ "$CHECKIN" = "Ingresso inválido para este evento" ] || rc=1
  check "11" "organizador A: C3 ($C3, de E2) no check-in de E1 → 'Ingresso inválido para este evento'" \
    "$rc" "HTTP $STATUS; checkin-result='$CHECKIN'"
else
  fail "11" "Sem o código C3 não há como fazer o check-in de C3 em E1" "C3 vazio"
fi

# --- Step 12: E3 with a pending (T5, …0003) and a confirmed (T6, …0001) ticket, then cancel ------
T5=""
T6=""
C6=""
T5_AT=$SECONDS
E3="$(create_event "$JAR_A" "E3 Fluxo $RUN_ID" 5 "50,00")"
if [ -n "$E3" ] && publish_event "$JAR_A" "$E3"; then
  T5_AT=$SECONDS
  api POST "/api/partner/events/$E3/purchases" "$(purchase_json "t5-$RUN_ID@example.com" 4000000000000003)"
  T5="$(jget "$BODY" "d.ticketId")"
  t5_http="$STATUS"
  api POST "/api/partner/events/$E3/purchases" "$(purchase_json "t6-$RUN_ID@example.com" 4000000000000001)"
  T6="$(jget "$BODY" "d.ticketId")"
  C6="$(jget "$BODY" "d.code")"
  rc=0; [ "$t5_http" = "202" ] && [ "$STATUS" = "202" ] || rc=1
  check "12" "E3 ($E3) comprado pela API: T5 (…0003) $T5 e T6 (…0001) $T6 (C6=$C6)" "$rc" \
    "T5 HTTP $t5_http; T6 HTTP $STATUS $BODY"
  st=""
  while [ $((SECONDS - T5_AT)) -le 20 ]; do
    st="$(ticket_status "$T6")"
    [ "$st" = "confirmed" ] && break
    sleep 0.5
  done
  rc=0; [ "$st" = "confirmed" ] || rc=1
  check "12" "T6 confirmado antes do cancelamento" "$rc" "status=$st"
  st5="$(ticket_status "$T5")"
  code="$(curl -s -o /dev/null -w '%{http_code}' -c "$JAR_A" -b "$JAR_A" -X POST \
    "$WEB/organizer/events/$E3/cancel")"
  cancel_at=$((SECONDS - T5_AT))
  rc=0; [ "$code" = "303" ] && [ "$cancel_at" -lt 30 ] && [ "$st5" = "pending" ] || rc=1
  check "12" "E3 cancelado ${cancel_at}s após a compra de T5 (antes de 30 s; T5 estava $st5)" "$rc" \
    "POST /organizer/events/$E3/cancel → HTTP $code"
else
  fail "12" "Não foi possível criar/publicar E3 como organizador A" "E3='$E3'"
fi

# --- Step 13: E3 is gone, refuses purchases, tickets move within 10 s, page is read-only -------
if [ -n "$E3" ]; then
  web_get "$WORK_DIR/visitor.jar" /
  rc=0; [ "$STATUS" = "200" ] && ! printf '%s' "$BODY" | grep -q "data-event-id=\"$E3\"" || rc=1
  check "13" "E3 cancelado não aparece na vitrine" "$rc" "GET / → HTTP $STATUS"
  api GET /api/partner/events
  listed="$(jget "$BODY" "d.some((e) => e.id === '$E3') ? 'yes' : 'no'")"
  rc=0; [ "$STATUS" = "200" ] && [ "$listed" = "no" ] || rc=1
  check "13" "E3 cancelado não aparece na listagem da API" "$rc" "HTTP $STATUS; listado=$listed"
  api POST "/api/partner/events/$E3/purchases" "$(purchase_json "t7-$RUN_ID@example.com" 4000000000000001)"
  rc=0; [ "$STATUS" = "404" ] && [ "$BODY" = '{"error":"event_not_available"}' ] || rc=1
  check "13" "compra de E3 pela API → 404 event_not_available" "$rc" "HTTP $STATUS $BODY"
  c13_at=$SECONDS
  st5=""
  st6=""
  while [ $((SECONDS - c13_at)) -le 10 ]; do
    st5="$(ticket_status "$T5")"
    st6="$(ticket_status "$T6")"
    [ "$st5" = "cancelled" ] && [ "$st6" = "refunded" ] && break
    sleep 0.5
  done
  rc=0; [ "$st5" = "cancelled" ] && [ "$st6" = "refunded" ] || rc=1
  check "13" "em até 10 s: T6 refunded e T5 cancelled" "$rc" "T6=$st6 T5=$st5"
  web_get "$JAR_A" "/organizer/events/$E3"
  rc=0
  [ "$STATUS" = "200" ] && [ "$(testid "$BODY" event-status)" = "Cancelado" ] || rc=1
  if printf '%s' "$BODY" | grep -Eq 'data-testid="(edit-form|publish-button|cancel-button)"'; then rc=1; fi
  check "13" "página de gestão de E3: Cancelado, sem edit-form, sem publicar e sem cancel-button" "$rc" \
    "GET /organizer/events/$E3 → HTTP $STATUS"
  MANAGE_E3="$BODY"
fi

# --- Step 14: 45 s after T5's purchase it is still cancelled ------------------------------------
if [ -n "$T5" ]; then
  info "Aguardando 45 s desde a compra de T5 (resposta tardia do gateway)"
  while [ $((SECONDS - T5_AT)) -lt 45 ]; do sleep 1; done
  st5="$(ticket_status "$T5")"
  st6="$(ticket_status "$T6")"
  rc=0; [ "$st5" = "cancelled" ] && [ "$st6" = "refunded" ] || rc=1
  check "14" "após $((SECONDS - T5_AT))s da compra, T5 continua cancelled (T6 $st6)" "$rc" \
    "T5=$st5 T6=$st6"
  if printf '%s' "${MANAGE_E3:-}" | grep -q 'data-testid="checkin-form"'; then
    curl -s -o "$WORK_DIR/page" -c "$JAR_A" -b "$JAR_A" -X POST \
      "$WEB/organizer/events/$E3/checkin" --data-urlencode "code=$C6" >/dev/null || true
    result="$(testid "$(cat "$WORK_DIR/page")" checkin-result)"
    rc=0; [ "$result" = "Evento cancelado" ] || rc=1
    check "14" "check-in de C6 em E3 → '$result'" "$rc" "esperado: Evento cancelado"
  else
    skip "14" "check-in de C6 em E3 → 'Evento cancelado' (TODO: F06 — check-in)"
  fi
fi
if [ -n "$E3" ]; then
  dash "$JAR_A" "$E3"
  expected="0/0/0/0/R\$ 0,00/1"
  rc=0; [ "$DASH" = "$expected" ] || rc=1
  check "14" "painel de E3 com Estornados 1 e o resto zerado ($DASH)" "$rc" "esperado: $expected"
fi

# --- Step 15: 30 concurrent purchases, twice ---------------------------------------------------
burst() {
  local event="$1" name="$2" out
  out="$(seq 30 | xargs -P 30 -I{} curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST "$API/api/partner/events/$event/purchases" \
    -H "X-Api-Key: $KEY" -H "Content-Type: application/json" \
    -d "{\"buyerEmail\":\"carga{}-$RUN_ID@example.com\",\"cardNumber\":\"4000000000000001\"}" |
    sort | uniq -c | awk '{print $1" "$2}' | tr '\n' ';' || true)"
  rc=0; [ "$out" = "5 202;25 409;" ] || rc=1
  check "15" "$name ($event): 30 compras simultâneas → $out" "$rc" "esperado: 5 202;25 409;"
}
for name in E4 E5; do
  ev="$(create_event "$JAR_A" "$name Fluxo $RUN_ID" 5 "10,00")"
  if [ -n "$ev" ] && publish_event "$JAR_A" "$ev"; then
    burst "$ev" "$name"
    b15_at=$SECONDS
    rc=0; wait_dash "$JAR_A" "$ev" "5/0/0/0/R\$ 50,00/0" 10 || rc=1
    check "15" "em $((SECONDS - b15_at))s o painel de $name mostra Confirmados 5 e Vagas 0 ($DASH)" \
      "$rc" "esperado em até 10 s: 5/0/0/0/R\$ 50,00/0"
  else
    fail "15" "Não foi possível criar/publicar $name" "id='$ev'"
  fi
done

# --- Step 16: auth and errors ------------------------------------------------------------------
ok16=0
detail16=""
for key in - wrong-key; do
  for route in "GET /api/partner/events" "POST /api/partner/events/$E1/purchases" "GET /api/partner/tickets/$T2"; do
    method="${route%% *}"
    path="${route#* }"
    data=""
    if [ "$method" = "POST" ]; then data="$(purchase_json u@example.com 4000000000000001)"; fi
    api "$method" "$path" "$data" "$key"
    if [ "$STATUS" != "401" ] || [ "$BODY" != '{"error":"unauthorized"}' ]; then
      ok16=1
      detail16="$detail16 [$route key=$key → $STATUS $BODY]"
    fi
  done
done
check "16" "3 rotas sem cabeçalho e com chave errada → 401 unauthorized (6 chamadas)" "$ok16" "$detail16"
api POST "/api/partner/events/$E1/purchases" '{"buyerEmail":"x@example.com","cardNumber":"123"}'
rc=0; [ "$STATUS" = "422" ] && [ "$BODY" = '{"error":"invalid_request"}' ] || rc=1
check "16" "cardNumber \"123\" → 422 invalid_request" "$rc" "HTTP $STATUS $BODY"
api GET /api/partner/tickets/tkt_inexistente
rc=0; [ "$STATUS" = "404" ] && [ "$BODY" = '{"error":"ticket_not_found"}' ] || rc=1
check "16" "ticketId inexistente → 404 ticket_not_found" "$rc" "HTTP $STATUS $BODY"

# --- Steps 17-18 --------------------------------------------------------------------------------
skip "17" "gates, down e nova subida (rode make gates; make down; make up)"
skip "18" "revisão dos artefatos (PRD, specs, relatórios, estado) — manual"

echo
echo "================ Fluxo do avaliador ================"
echo "  PASS: $PASSED   FAIL: $FAILED   SKIP: $SKIPPED"
echo "===================================================="
if [ "$FAILED" -ne 0 ]; then
  err "FLOW-FAIL" "$FAILED verificação(ões) do Fluxo do avaliador falharam" \
    "Veja as mensagens [ERRO][FLOW-NN] acima." \
    "Corrija o comportamento e rode de novo: make evaluator-flow"
  exit 1
fi
ok "Todas as verificações implementadas passaram"
