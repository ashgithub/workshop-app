set -x
BASE_URL=https://macmini.industrylab.uk/workshop-app


echo "health check $BASE_URL"
curl --verbose -H "Authorization: Bearer $OLLAMA_BEARER" $BASE_URL/api/health 
