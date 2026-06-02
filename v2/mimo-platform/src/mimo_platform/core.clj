(ns mimo-platform.core
  (:require [io.pedestal.connector :as conn]
            [io.pedestal.http.http-kit :as hk]
            [clojure.data.json :as json]
            [clojure.java.io :as io]
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

(defn auth-login [request]
  (let [username (get-in request [:json-params :username])
        password (get-in request [:json-params :password])
        cred (credentials/make-credentials username :mimo-dir "/home/bit4bit/.mimo")]
    (if-let [auth-token (credentials/generate-token cred password "secret")]
      {:status 200 :body {:success true :data {:token auth-token :username username}}}
      {:status 200 :body {:success false :error "invalid credentials" :code 401}})))

(def routes
  #{["/greet" :get [coerce-body-interceptor
                    content-negotiation-interceptor
                    greet-handler] :route-name :greet]
    ["/api/internal/auth/login" :post [coerce-body-interceptor
                                       content-negotiation-interceptor
                                       auth-login] :route-name :auth-login]}
  )

(defn create-connector [& {:keys [port] :or {port 0}}]
  (-> (conn/default-connector-map port)
      (conn/with-default-interceptors)
      (conn/with-routes routes)
      (hk/create-connector nil)))

(defn -main [& _]
  (conn/start! (create-connector :port 8890)))
