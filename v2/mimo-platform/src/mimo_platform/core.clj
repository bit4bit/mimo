(ns mimo-platform.core
  (:require
   [com.stuartsierra.component :as component]
   mimo-platform.system))

;; (defn create-connector [{:keys [http-port listen-host] :as mimo}]
;;   (-> (conn/default-connector-map http-port)
;;       (assoc :host listen-host)
;;       (conn/with-default-interceptors)
;;       (conn/with-routes (mimo-platform.routes/routes {:mimo mimo}))
;;       (hk/create-connector nil)))


(defn -main [& _]
  (-> (mimo-platform.system/new-system)
      (component/start-system)))
