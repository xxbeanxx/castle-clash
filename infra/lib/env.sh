#!/usr/bin/env bash
# Sourced by the infra scripts: the one place the environment -> resource-name
# mapping lives. Renaming an app or host means editing this file (and the
# GitHub variables `configure-environment.sh` derives from it), nothing else.
#
#   source "$(dirname "${BASH_SOURCE[0]}")/../lib/env.sh"
#   load_environment "$1"
#
# Sets: ENVIRONMENT SUFFIX RG CAE SERVER_APP CLIENT_APP CLIENT_HOST GAME_HOST
#       CLIENT_MIN_REPLICAS SERVER_CPU SERVER_MEMORY REPO DNS_ZONE

REPO="${REPO:-xxbeanxx/castle-clash}"
DNS_ZONE="${DNS_ZONE:-atomic-nucleus.com}"

load_environment() {
  ENVIRONMENT="${1:?usage: <script> staging|production}"
  case "$ENVIRONMENT" in
    staging)
      SUFFIX="staging"
      CLIENT_HOST="castle-clash-staging"
      GAME_HOST="castle-clash-game-staging"
      CLIENT_MIN_REPLICAS=0
      SERVER_CPU="1.0"
      SERVER_MEMORY="2Gi"
      ;;
    production)
      SUFFIX="prod"
      CLIENT_HOST="castle-clash"
      GAME_HOST="castle-clash-game"
      CLIENT_MIN_REPLICAS=1
      # Consumption-only environments cap an app at 2 vCPU / 4 GiB.
      SERVER_CPU="2.0"
      SERVER_MEMORY="4Gi"
      ;;
    *)
      echo "environment must be staging or production" >&2
      return 2
      ;;
  esac
  RG="rg-castle-clash-${SUFFIX}"
  CAE="cae-castle-clash-${SUFFIX}"
  SERVER_APP="ca-castle-clash-server-${SUFFIX}"
  CLIENT_APP="ca-castle-clash-client-${SUFFIX}"
  export ENVIRONMENT SUFFIX RG CAE SERVER_APP CLIENT_APP CLIENT_HOST GAME_HOST \
    CLIENT_MIN_REPLICAS SERVER_CPU SERVER_MEMORY REPO DNS_ZONE
}
