(defproject mimo-platform "0.1.0-SNAPSHOT"
  :description "FIXME: write description"
  :url "https://example.com/FIXME"
  :license {:name "EPL-2.0 OR GPL-2.0-or-later WITH Classpath-exception-2.0"
            :url "https://www.eclipse.org/legal/epl-2.0/"}
  :dependencies [[org.clojure/clojure "1.12.2"]
                 [io.pedestal/pedestal.http-kit "0.8.2-beta-6"]
                 [org.clojure/data.json "2.5.2"]
                 [clj-commons/clj-yaml "1.0.29"]
                 [org.mindrot/jbcrypt "0.4"]
                 [buddy/buddy-sign "3.6.1-359"]
                 [nubank/matcher-combinators "3.10.0"]
                 [com.stuartsierra/component "1.2.0"]]
  :repl-options {:init-ns mimo-platform.core}
  :main mimo-platform.core)
