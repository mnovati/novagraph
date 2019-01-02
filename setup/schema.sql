-- MySQL dump 10.13  Distrib 5.5.59, for Linux (x86_64)
--

DELIMITER //

CREATE FUNCTION uuid2bin(_uuid BINARY(36))
	RETURNS BINARY(16)
	LANGUAGE SQL  DETERMINISTIC  CONTAINS SQL  SQL SECURITY INVOKER
RETURN
	UNHEX(CONCAT(
		SUBSTR(_uuid, 15, 4),
		SUBSTR(_uuid, 10, 4),
		SUBSTR(_uuid,  1, 8),
		SUBSTR(_uuid, 20, 4),
		SUBSTR(_uuid, 25) ));

CREATE FUNCTION bin2uuid(_bin BINARY(16))
	RETURNS BINARY(36)
	LANGUAGE SQL  DETERMINISTIC  CONTAINS SQL  SQL SECURITY INVOKER
RETURN
	LCASE(CONCAT_WS('-',
		HEX(SUBSTR(_bin,  5, 4)),
		HEX(SUBSTR(_bin,  3, 2)),
		HEX(SUBSTR(_bin,  1, 2)),
		HEX(SUBSTR(_bin,  9, 2)),
		HEX(SUBSTR(_bin, 11))
	));

//
DELIMITER ;

CREATE DATABASE /*!32312 IF NOT EXISTS*/ `novagraph`;

USE `novagraph`;

--
-- Table structure for table `edges`
--

DROP TABLE IF EXISTS `edges`;
CREATE TABLE `edges` (
  `from_id` binary(16) DEFAULT NULL,
  `type` smallint(5) unsigned DEFAULT NULL,
  `to_id` binary(16) DEFAULT NULL,
  `data` varchar(1024) DEFAULT NULL,
  `time_created` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `time_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `status` smallint(6) DEFAULT NULL,
  KEY `fromidtype` (`from_id`,`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Table structure for table `objects`
--

DROP TABLE IF EXISTS `objects`;
CREATE TABLE `objects` (
  `id` binary(16) NOT NULL,
  `type` smallint(5) unsigned DEFAULT NULL,
  `data` json DEFAULT NULL,
  `time_created` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `time_updated` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `status` smallint(6) DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Table structure for table `indices`
--

DROP TABLE IF EXISTS `indices`;
CREATE TABLE `indices` (
  `key` binary(20) NOT NULL,
  `value` binary(16) NOT NULL,
  KEY `keyvalue` (`key`,`value`),
  INDEX `hashlookup` (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Table structure for table `geo_indices`
--

DROP TABLE IF EXISTS `geoindices`;
CREATE TABLE `geoindices` (
  `id` binary(16) NOT NULL,
  `type` smallint(5) unsigned DEFAULT NULL,
  `shape` geometry NOT NULL,
  PRIMARY KEY (`id`),
  SPATIAL KEY `shape` (`shape`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;

--
-- Table structure for table `fts_indices`
--

DROP TABLE IF EXISTS `ftsindices`;
CREATE TABLE `ftsindices` (
  `id` binary(16) NOT NULL,
  `type` smallint(5) unsigned NOT NULL,
  `data` text NOT NULL,
  PRIMARY KEY (`id`, `type`),
  INDEX (`type`),
  FULLTEXT (`data`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;


--
-- Table structure for table `deferindices`
--

DROP TABLE IF EXISTS `deferindices`;
CREATE TABLE `deferindices` (
  `id` binary(16) NOT NULL,
  `type` smallint(5) unsigned NOT NULL,
  `defer_time` timestamp NOT NULL,
  PRIMARY KEY (`id`),
  INDEX (`type`, `defer_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8;
