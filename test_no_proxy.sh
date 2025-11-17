BASE_URL="http://localhost"


echo "health check"
http $BASE_URL/api/health Authorization:"Bearer $TOKEN"
