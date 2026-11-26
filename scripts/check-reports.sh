#!/usr/bin/env bash
# Validates evaluation reports and the project state file.
#   - every report under docs/features/*/reports/*.md is committed in exactly ONE commit (immutable)
#   - every report has the mandatory header fields
#   - state/project-state.json: each latestReport exists and is the newest report of the feature;
#     a feature marked "done" has an approved newest report
#   --final : additionally requires every feature to be "done" (delivery check)
set -uo pipefail
# shellcheck source=scripts/lib.sh
source "$(dirname "$0")/lib.sh"
cd "$ROOT_DIR" || exit 1

final=0
[ "${1:-}" = "--final" ] && final=1
STATE="state/project-state.json"
failed=0
fields=("Data:" "Commit avaliado:" "Ferramenta:" "Modelo:" "Veredito geral:")

json() { node_run -e "const s=require('./$STATE');$1" 2>/dev/null; }

if [ ! -f "$STATE" ]; then
  die "STATE-001" "$STATE não encontrado" "O arquivo de estado do projeto foi apagado ou movido." "Restaure o arquivo (git checkout -- $STATE)."
fi
if ! node_run -e "require('./$STATE')" 2>/dev/null; then
  die "STATE-002" "$STATE não é um JSON válido" "Edição manual quebrou o JSON." "Valide com: jq . $STATE"
fi

shopt -s nullglob
for report in docs/features/*/reports/*.md; do
  for f in "${fields[@]}"; do
    if ! grep -q "\*\*$f\*\*" "$report"; then
      err "REPORT-001" "Relatório sem o campo '$f': $report" "O relatório não segue o modelo do avaliador." \
        "Gere um NOVO relatório completo (relatórios commitados não podem ser editados)."
      failed=1
    fi
  done
  if git ls-files --error-unmatch "$report" >/dev/null 2>&1; then
    commits="$(git log --format=%h -- "$report" | wc -l | tr -d ' ')"
    if [ "$commits" != "1" ]; then
      err "REPORT-002" "Relatório alterado depois de commitado ($commits commits): $report" \
        "Relatórios de avaliação são imutáveis." \
        "Reverta a alteração e gere um novo relatório para a reavaliação." "git log --format='%h %ad' --date=iso -- $report"
      failed=1
    elif ! git diff --quiet HEAD -- "$report"; then
      err "REPORT-003" "Relatório commitado com alterações locais: $report" "Edição de relatório existente." \
        "git checkout -- $report e gere um relatório novo."
      failed=1
    fi
  else
    warn "Relatório ainda não commitado: $report"
  fi
done

features="$(json "console.log(Object.keys(s.features).join(' '))")"
for id in $features; do
  status="$(json "console.log(s.features['$id'].status)")"
  latest="$(json "console.log(s.features['$id'].latestReport||'')")"
  folder="$(find docs/features -maxdepth 1 -type d -name "$id-*" | head -1)"
  newest=""
  if [ -n "$folder" ] && [ -d "$folder/reports" ]; then
    newest="$(find "$folder/reports" -maxdepth 1 -type f -name '*.md' | sort | tail -1)"
  fi
  if [ -n "$latest" ] && [ ! -f "$latest" ]; then
    err "STATE-003" "$id: latestReport aponta para arquivo inexistente: $latest" "Caminho errado no estado." "Corrija $STATE."
    failed=1
  fi
  if [ -n "$newest" ] && [ "$latest" != "$newest" ]; then
    err "STATE-004" "$id: latestReport ($latest) não é o relatório mais recente ($newest)" \
      "O estado não foi atualizado após a última avaliação." "Atualize latestReport em $STATE."
    failed=1
  fi
  if [ "$status" = "done" ]; then
    if [ -z "$newest" ] || ! grep -qE '\*\*Veredito geral:\*\* *APROVADO' "$newest"; then
      err "STATE-005" "$id está 'done' mas o relatório mais recente não está APROVADO" \
        "Feature concluída sem avaliação aprovada." "Corrija os itens reprovados e rode nova avaliação."
      failed=1
    fi
  elif [ "$final" = "1" ]; then
    err "STATE-006" "$id não está concluída (status: $status)" "Entrega final exige todas as features 'done'." \
      "Conclua a feature e a avaliação."
    failed=1
  fi
done

[ "$failed" = "1" ] && exit 1
ok "Relatórios imutáveis e estado consistente ($(echo "$features" | wc -w | tr -d ' ') features)"
