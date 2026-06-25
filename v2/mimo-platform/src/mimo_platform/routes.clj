(ns mimo-platform.routes
  (:require
   [clojure.data.json :as json]
   [mimo-platform.credentials :as credentials]
   [io.pedestal.http.content-negotiation :as content-negotiation]))

(def supported-types ["application/json"])

(def content-negotiation-interceptor
  (content-negotiation/negotiate-content supported-types))

(def coerce-body-interceptor
  {:name ::coerce-body
   :leave
   (fn [context]
     (let [accepted (get-in context [:request :accept :field] "application/json")
           response (get context :response)
           body (get response :body)
           coerced-body (case accepted
                          "application/json" (json/write-str body))
           updated-response (assoc response
                                   :headers {"Content-Type" accepted}
                                   :body coerced-body)]
       (assoc context :response updated-response)))
   })

(defn greet-handler [_request]
  {:status 200 :body {:success true :data {}}})


(defn auth-login [{:keys [mimo-dir jwt-secret]} request]
  (let [username (get-in request [:json-params :username])
        password (get-in request [:json-params :password])
        cred (credentials/make-credentials username :mimo-dir mimo-dir)]
    (if-let [auth-token (credentials/generate-token cred password jwt-secret)]
      (let [created-at (credentials/created-at cred)]
        {:status 200 :body {:success true :data {:token auth-token :username username :createdAt created-at}}})
      {:status 200 :body {:success false :error "invalid credentials" :code 401}})))

(defn routes [& {:keys [mimo]}]
  #{["/greet" :get [coerce-body-interceptor
                    content-negotiation-interceptor
                    greet-handler] :route-name :greet]
    ["/api/internal/auth/login" :post [coerce-body-interceptor
                                       content-negotiation-interceptor
                                       (partial auth-login mimo)] :route-name :auth-login]}
  )
